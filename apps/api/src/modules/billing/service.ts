import type { Env } from "@clipflow/config";
import { prisma } from "../../lib/prisma.js";
import { requireDatabase } from "../../lib/db-guard.js";
import { cache } from "../../lib/cache.js";
import { AppError } from "../../errors/AppError.js";
import { getBillingClient } from "./client.js";
import { toPlanDto, toSubscriptionDto, toUsageDto } from "./types.js";
import type { PlanDto, SubscriptionDto, UsageDto } from "./types.js";
import type { CreateCheckoutInput } from "./schemas.js";

const FREE_PLAN_KEY = "free";

async function ensureSubscription(userId: string) {
  const existing = await prisma.subscription.findUnique({
    where: { userId },
    include: { plan: true },
  });
  if (existing) return existing;

  const freePlan = await prisma.plan.findUnique({ where: { key: FREE_PLAN_KEY } });
  if (!freePlan) {
    throw new AppError(500, "BILLING_NOT_SEEDED", "Free plan row missing. Run prisma seed.");
  }

  return prisma.subscription.create({
    data: { userId, planId: freePlan.id, status: "ACTIVE", videosUsedThisPeriod: 0 },
    include: { plan: true },
  });
}

export async function listPlans(): Promise<PlanDto[]> {
  const plans = await prisma.plan.findMany({
    orderBy: { sortOrder: "asc" },
  });
  return plans.map(toPlanDto);
}

export async function getSubscription(userId: string) {
  requireDatabase();
  const sub = await ensureSubscription(userId);
  return {
    plan: toPlanDto(sub.plan),
    subscription: toSubscriptionDto(sub),
    usage: toUsageDto(sub),
  };
}

export async function createCheckout(
  userId: string,
  input: CreateCheckoutInput,
  env: Env,
) {
  requireDatabase();
  const sub = await ensureSubscription(userId);

  if (sub.status === "ACTIVE" && sub.plan.key !== FREE_PLAN_KEY) {
    throw new AppError(409, "ALREADY_SUBSCRIBED", "You already have an active subscription.");
  }

  const plan = await prisma.plan.findUnique({ where: { key: input.planId } });
  if (!plan || !plan.dodoProductId) {
    throw new AppError(400, "INVALID_PLAN", `Plan "${input.planId}" is not available for checkout.`);
  }

  const appUrl = env.APP_URL ?? env.WEB_ORIGIN;
  const billingClient = getBillingClient();

  if (input.country?.toUpperCase() === "IN" && !billingClient.isInSupported()) {
    throw new AppError(502, "DODO_CHECKOUT_FAILED", "India is not yet supported by Dodo Payments in this environment.");
  }

  try {
    const result = await billingClient.createCheckoutSession({
      dodoProductId: plan.dodoProductId,
      customerId: sub.dodoCustomerId ?? undefined,
      country: input.country,
      billingCurrency: input.billingCurrency,
      returnUrl: `${appUrl}/billing/success`,
      cancelUrl: `${appUrl}/billing`,
    });

    return {
      checkoutUrl: result.checkoutUrl,
      sessionId: result.sessionId,
    };
  } catch (err) {
    throw new AppError(502, "DODO_CHECKOUT_FAILED", "Failed to create checkout session with Dodo Payments.");
  }
}

export async function openCustomerPortal(userId: string): Promise<{ url: string } | { available: false }> {
  requireDatabase();
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub?.dodoCustomerId) {
    return { available: false };
  }

  const billingClient = getBillingClient();
  const url = await billingClient.getCustomerPortalUrl(sub.dodoCustomerId);

  if (!url) {
    return { available: false };
  }

  return { url };
}

export async function cancelScheduled(userId: string) {
  requireDatabase();
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    include: { plan: true },
  });

  if (!sub || sub.plan.key === "free") {
    throw new AppError(409, "NO_ACTIVE_SUBSCRIPTION", "No active paid subscription to cancel.");
  }

  if (!sub.dodoSubscriptionId) {
    throw new AppError(409, "NO_ACTIVE_SUBSCRIPTION", "No Dodo subscription reference found.");
  }

  const billingClient = getBillingClient();
  try {
    await billingClient.cancelSubscription(sub.dodoSubscriptionId);
  } catch {
    throw new AppError(502, "DODO_CANCEL_FAILED", "Failed to communicate cancellation with Dodo Payments.");
  }

  const updated = await prisma.subscription.update({
    where: { userId },
    data: { cancelAtPeriodEnd: true, status: "CANCELED" },
    include: { plan: true },
  });

  await cache.del(`access:${userId}`);

  return toSubscriptionDto(updated);
}