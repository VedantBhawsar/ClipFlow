import type { PrismaClient } from "@prisma/client";
import type { Env } from "@clipflow/config";
import { prisma } from "../../lib/prisma.js";
import { cache } from "../../lib/cache.js";
import { AppError } from "../../errors/AppError.js";
import { getBillingClient } from "./client.js";

interface WebhookInput {
  rawBody: Buffer;
  signatureHeader: string;
  eventId: string;
  timestamp: string;
  env: Env;
}

export async function handleWebhookEvent(input: WebhookInput): Promise<void> {
  const { rawBody, signatureHeader, eventId, timestamp, env } = input;

  const now = Date.now();
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(now - ts * 1000) > 5 * 60 * 1000) {
    throw new AppError(401, "SIGNATURE_EXPIRED", "Webhook timestamp is too old.");
  }

  const client = getBillingClient();
  const valid = client.verifyWebhookSignature(rawBody, signatureHeader, timestamp);
  if (!valid) {
    throw new AppError(401, "INVALID_SIGNATURE", "Webhook signature verification failed.");
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new AppError(400, "INVALID_PAYLOAD", "Webhook body is not valid JSON.");
  }

  const eventType = (payload.type ?? payload.event_type ?? "") as string;
  if (!eventType) {
    throw new AppError(400, "MISSING_EVENT_TYPE", "Webhook payload missing event type.");
  }

  const processed = await prisma.webhookEvent.findUnique({
    where: { provider_eventId: { provider: "dodo", eventId } },
  });
  if (processed) return;

  const eventData = (payload.data ?? payload) as Record<string, unknown> | undefined;
  const dodoSubscriptionId = (eventData?.subscription_id ?? eventData?.id ?? "") as string;

  await prisma.$transaction(async (tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$use" | "$extends">) => {
    await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1::text))", eventId);

    const dup = await (tx as typeof prisma).webhookEvent.findUnique({
      where: { provider_eventId: { provider: "dodo", eventId } },
    });
    if (dup) return;

    await (tx as typeof prisma).webhookEvent.create({
      data: {
        provider: "dodo",
        eventId,
        eventType,
        payload: payload as object,
      },
    });

    if (dodoSubscriptionId || eventType === "payment.failed" || eventType === "refund.succeeded") {
      await dispatchEvent(tx as typeof prisma, eventType, eventData);
    }

    await (tx as typeof prisma).webhookEvent.update({
      where: { provider_eventId: { provider: "dodo", eventId } },
      data: { processedAt: new Date() },
    });
  });
}

async function dispatchEvent(tx: typeof prisma, eventType: string, data: Record<string, unknown> | undefined): Promise<void> {
  const subId = (data?.subscription_id ?? data?.id ?? "") as string;
  const productId = data?.product_id as string | undefined;
  const customerId = data?.customer_id as string | undefined;

  switch (eventType) {
    case "subscription.active":
    case "subscription.renewed":
      await handleActiveOrRenewed(tx, subId, productId, customerId, data);
      break;
    case "subscription.plan_changed":
      await handlePlanChange(tx, subId, productId);
      break;
    case "subscription.on_hold":
      await updateStatus(tx, subId, "ON_HOLD");
      break;
    case "subscription.cancelled":
      await handleCancel(tx, subId, data);
      break;
    case "payment.failed":
      await handlePaymentFail(tx, subId);
      break;
    case "refund.succeeded":
      await handleRefund(tx, subId);
      break;
  }
}

async function resolvePlan(tx: typeof prisma, productId: string | undefined) {
  if (!productId) return null;
  return tx.plan.findFirst({ where: { dodoProductId: productId } });
}

async function handleActiveOrRenewed(
  tx: typeof prisma,
  subId: string,
  productId: string | undefined,
  customerId: string | undefined,
  data: Record<string, unknown> | undefined,
) {
  const plan = await resolvePlan(tx, productId);
  const existing = await tx.subscription.findFirst({
    where: { dodoSubscriptionId: subId },
    include: { plan: true },
  });

  const periodStart = data?.period_start ? new Date(data.period_start as string) : new Date();
  const periodEnd = data?.period_end
    ? new Date(data.period_end as string)
    : data?.next_billing_date
      ? new Date(data.next_billing_date as string)
      : null;

  const base: Record<string, unknown> = {
    status: "ACTIVE",
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    paymentFailedAt: null,
  };
  if (plan) base.planId = plan.id;
  if (customerId) base.dodoCustomerId = customerId;

  if (existing) {
    if (!periodEnd || !existing.currentPeriodEnd || periodEnd > existing.currentPeriodEnd) {
      base.videosUsedThisPeriod = 0;
      base.thumbnailsUsedThisPeriod = 0;
    }
    await tx.subscription.update({
      where: { dodoSubscriptionId: subId },
      data: base,
    });
  } else {
    const freePlan = await tx.plan.findUnique({ where: { key: "free" } });
const user = customerId
      ? await tx.subscription.findFirst({ where: { dodoCustomerId: customerId }, select: { userId: true } })
      : null;
    const resolvedUserId = user?.userId ?? (customerId ?? "unknown");
    await tx.subscription.create({
      data: {
        userId: resolvedUserId,
        dodoSubscriptionId: subId,
        dodoCustomerId: customerId,
        planId: plan?.id ?? freePlan?.id ?? "unknown",
        status: "ACTIVE",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        videosUsedThisPeriod: 0,
        thumbnailsUsedThisPeriod: 0,
      },
    });
  }
}

async function handlePlanChange(tx: typeof prisma, subId: string, productId: string | undefined) {
  const plan = await resolvePlan(tx, productId);
  if (!plan) return;

  const existing = await tx.subscription.findFirst({
    where: { dodoSubscriptionId: subId },
    include: { plan: true },
  });
  if (!existing) return;

  const isUpgrade = existing.plan.priceUsd < plan.priceUsd;

  await tx.subscription.update({
    where: { dodoSubscriptionId: subId },
    data: {
      planId: plan.id,
      videosUsedThisPeriod: isUpgrade ? 0 : existing.videosUsedThisPeriod,
      thumbnailsUsedThisPeriod: isUpgrade ? 0 : existing.thumbnailsUsedThisPeriod,
    },
  });
}

async function updateStatus(tx: typeof prisma, subId: string, status: "ACTIVE" | "ON_HOLD" | "CANCELED" | "EXPIRED") {
  const subs = await tx.subscription.findMany({ where: { dodoSubscriptionId: subId } });
  await tx.subscription.updateMany({ where: { dodoSubscriptionId: subId }, data: { status } });
  for (const s of subs) {
    void cache.del(`access:${s.userId}`);
  }
}

async function handleCancel(tx: typeof prisma, subId: string, data: Record<string, unknown> | undefined) {
  const periodEnd = data?.period_end
    ? new Date(data.period_end as string)
    : data?.current_period_end
      ? new Date(data.current_period_end as string)
      : null;

  const subs = await tx.subscription.findMany({ where: { dodoSubscriptionId: subId } });
  await tx.subscription.updateMany({
    where: { dodoSubscriptionId: subId },
    data: {
      status: "CANCELED",
      cancelAtPeriodEnd: true,
      ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
    },
  });
  for (const s of subs) {
    await cache.del(`access:${s.userId}`);
  }
}

async function handlePaymentFail(tx: typeof prisma, subId: string) {
  await tx.subscription.updateMany({
    where: { dodoSubscriptionId: subId },
    data: { paymentFailedAt: new Date() },
  });
}

async function handleRefund(tx: typeof prisma, subId: string) {
  const subs = await tx.subscription.findMany({ where: { dodoSubscriptionId: subId } });
  await tx.subscription.updateMany({
    where: { dodoSubscriptionId: subId },
    data: { status: "CANCELED", cancelAtPeriodEnd: true, currentPeriodEnd: new Date() },
  });
  for (const s of subs) {
    await cache.del(`access:${s.userId}`);
  }
}