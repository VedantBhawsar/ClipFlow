import type { Env } from "@clipflow/config";
import { isBillingEnabled } from "@clipflow/config";
import { prisma } from "./prisma.js";
import { requireDatabase } from "./db-guard.js";
import { AppError } from "../errors/AppError.js";
import { cache } from "./cache.js";

export type EffectiveAccess = {
  canUpload: boolean;
  reason?: "PLAN_LIMIT_REACHED" | "SUBSCRIPTION_INACTIVE" | "SUBSCRIPTION_EXPIRED";
  planKey: string;
  videosAllowed: number;
  videosUsed: number;
};

const FREE_PLAN_KEY = "free";

async function getFreePlan() {
  const plan = await prisma.plan.findUnique({ where: { key: FREE_PLAN_KEY } });
  if (!plan) throw new AppError(500, "BILLING_NOT_SEEDED", "Free plan row missing.");
  return plan;
}

/**
 * When billing is disabled (the default), every user is effectively on
 * free unlimited — no plan row lookup, no cache check, no quota math.
 * Returned shape is the same as a free-plan-allowed `EffectiveAccess`
 * so downstream code can treat it identically.
 */
function billingDisabledAccess(): EffectiveAccess {
  return {
    canUpload: true,
    planKey: FREE_PLAN_KEY,
    videosAllowed: Number.POSITIVE_INFINITY,
    videosUsed: 0,
  };
}

export const evaluateUploadAccess = async (userId: string, env: Env): Promise<EffectiveAccess> => {
  if (!isBillingEnabled(env)) return billingDisabledAccess();

  requireDatabase();

  const cached = await cache.get(`access:${userId}`);
  if (cached) {
    try {
      return JSON.parse(cached) as EffectiveAccess;
    } catch {}
  }

  const sub = await prisma.subscription.findUnique({
    where: { userId },
    include: { plan: true },
  });

  const plan = sub?.plan ?? (await getFreePlan());
  const now = new Date();
  const active = !sub || (
    sub.status === "ACTIVE" ||
    (sub.status === "CANCELED" && sub.currentPeriodEnd && sub.currentPeriodEnd > now)
  );

  let result: EffectiveAccess;
  if (!active) {
    result = {
      canUpload: false,
      reason: "SUBSCRIPTION_INACTIVE",
      planKey: plan.key,
      videosAllowed: plan.videosPerMonth,
      videosUsed: sub?.videosUsedThisPeriod ?? 0,
    };
  } else if ((sub?.videosUsedThisPeriod ?? 0) >= plan.videosPerMonth) {
    result = {
      canUpload: false,
      reason: "PLAN_LIMIT_REACHED",
      planKey: plan.key,
      videosAllowed: plan.videosPerMonth,
      videosUsed: sub!.videosUsedThisPeriod,
    };
  } else {
    result = {
      canUpload: true,
      planKey: plan.key,
      videosAllowed: plan.videosPerMonth,
      videosUsed: sub?.videosUsedThisPeriod ?? 0,
    };
  }

  await cache.set(`access:${userId}`, JSON.stringify(result), 30);
  return result;
};

export const assertWithinVideoLimit = async (userId: string, env: Env): Promise<void> => {
  const access = await evaluateUploadAccess(userId, env);
  if (access.canUpload) return;

  if (access.reason === "PLAN_LIMIT_REACHED") {
    throw new AppError(
      403,
      "PLAN_LIMIT_REACHED",
      `You've used all ${access.videosAllowed} videos for this period. Upgrade your plan to continue.`,
      { planId: access.planKey, currentTier: access.planKey, videosUsed: access.videosUsed, videosAllowed: access.videosAllowed },
    );
  }
  if (access.reason === "SUBSCRIPTION_INACTIVE") {
    throw new AppError(
      402,
      "SUBSCRIPTION_INACTIVE",
      "Your subscription is not active. Update your payment method to continue uploading.",
    );
  }
  throw new AppError(403, "SUBSCRIPTION_EXPIRED", "Your subscription has expired.");
};