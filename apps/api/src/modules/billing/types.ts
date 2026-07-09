import type { Plan, Subscription, SubscriptionStatus } from "@clipflow/db";

export interface PlanDto {
  id: string;
  key: string;
  name: string;
  priceUsd: number;
  videosPerMonth: number;
  thumbnailsPerVideo: number;
  isHighlighted: boolean;
  sortOrder: number;
}

export interface SubscriptionDto {
  id: string;
  planKey: string;
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  videosUsedThisPeriod: number;
  thumbnailsUsedThisPeriod: number;
  paymentFailedAt: string | null;
}

export interface UsageDto {
  videosUsed: number;
  videosAllowed: number;
  thumbnailsUsed: number;
  thumbnailsAllowed: number;
  periodEnd: string | null;
}

export function toPlanDto(plan: Plan): PlanDto {
  return {
    id: plan.id,
    key: plan.key,
    name: plan.name,
    priceUsd: plan.priceUsd,
    videosPerMonth: plan.videosPerMonth,
    thumbnailsPerVideo: plan.thumbnailsPerVideo,
    isHighlighted: plan.isHighlighted,
    sortOrder: plan.sortOrder,
  };
}

export function toSubscriptionDto(sub: Subscription & { plan: Plan }): SubscriptionDto {
  return {
    id: sub.id,
    planKey: sub.plan.key,
    status: sub.status,
    currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    videosUsedThisPeriod: sub.videosUsedThisPeriod,
    thumbnailsUsedThisPeriod: sub.thumbnailsUsedThisPeriod,
    paymentFailedAt: sub.paymentFailedAt?.toISOString() ?? null,
  };
}

export function toUsageDto(sub: Subscription & { plan: Plan }): UsageDto {
  return {
    videosUsed: sub.videosUsedThisPeriod,
    videosAllowed: sub.plan.videosPerMonth,
    thumbnailsUsed: sub.thumbnailsUsedThisPeriod,
    thumbnailsAllowed: sub.plan.thumbnailsPerVideo,
    periodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
  };
}