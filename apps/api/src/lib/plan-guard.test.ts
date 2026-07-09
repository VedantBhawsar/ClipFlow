import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "./prisma.js";
import { cache } from "./cache.js";

vi.mock("./prisma.js", () => ({
  prisma: {
    subscription: {
      findUnique: vi.fn(),
    },
    plan: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("./cache.js", () => ({
  cache: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock("./db-guard.js", () => ({
  requireDatabase: vi.fn(),
}));

const FREE_PLAN = {
  id: "plan-free",
  key: "free",
  name: "Free",
  priceUsd: 0,
  videosPerMonth: 1,
  thumbnailsPerVideo: 1,
  isHighlighted: false,
  sortOrder: 0,
  interval: "MONTH" as const,
  dodoProductId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const STARTER_PLAN = {
  ...FREE_PLAN,
  id: "plan-starter",
  key: "starter",
  name: "Starter",
  priceUsd: 15,
  videosPerMonth: 5,
  thumbnailsPerVideo: 3,
  dodoProductId: "pdt_starter_abc",
  sortOrder: 1,
};

describe("evaluateUploadAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cache.get).mockResolvedValue(null);
  });

  it("returns canUpload=true when videosUsed < plan.videosPerMonth", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      id: "sub-1",
      userId: "user-1",
      planId: "plan-starter",
      status: "ACTIVE",
      dodoSubscriptionId: null,
      dodoCustomerId: null,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      videosUsedThisPeriod: 4,
      thumbnailsUsedThisPeriod: 2,
      paymentFailedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      plan: STARTER_PLAN,
    });

    const { evaluateUploadAccess } = await import("./plan-guard.js");
    const result = await evaluateUploadAccess("user-1");
    expect(result.canUpload).toBe(true);
    expect(result.videosUsed).toBe(4);
    expect(result.videosAllowed).toBe(5);
    expect(result.planKey).toBe("starter");
  });

  it("throws PLAN_LIMIT_REACHED when videosUsed >= plan.videosPerMonth", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      id: "sub-1",
      userId: "user-1",
      planId: "plan-starter",
      status: "ACTIVE",
      dodoSubscriptionId: null,
      dodoCustomerId: null,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      videosUsedThisPeriod: 5,
      thumbnailsUsedThisPeriod: 2,
      paymentFailedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      plan: STARTER_PLAN,
    });

    const { assertWithinVideoLimit } = await import("./plan-guard.js");
    await expect(assertWithinVideoLimit("user-1")).rejects.toMatchObject({ code: "PLAN_LIMIT_REACHED" });
  });

  it("returns SUBSCRIPTION_INACTIVE for ON_HOLD status", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      id: "sub-1",
      userId: "user-1",
      planId: "plan-starter",
      status: "ON_HOLD",
      dodoSubscriptionId: null,
      dodoCustomerId: null,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      videosUsedThisPeriod: 0,
      thumbnailsUsedThisPeriod: 0,
      paymentFailedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      plan: STARTER_PLAN,
    });

    const { assertWithinVideoLimit } = await import("./plan-guard.js");
    await expect(assertWithinVideoLimit("user-1")).rejects.toMatchObject({ code: "SUBSCRIPTION_INACTIVE" });
  });

  it("treats CANCELED with future periodEnd as still active", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      id: "sub-1",
      userId: "user-1",
      planId: "plan-starter",
      status: "CANCELED",
      dodoSubscriptionId: null,
      dodoCustomerId: null,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: true,
      videosUsedThisPeriod: 2,
      thumbnailsUsedThisPeriod: 1,
      paymentFailedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      plan: STARTER_PLAN,
    });

    const { evaluateUploadAccess } = await import("./plan-guard.js");
    const result = await evaluateUploadAccess("user-1");
    expect(result.canUpload).toBe(true);
  });

  it("blocks CANCELED with past periodEnd", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue({
      id: "sub-1",
      userId: "user-1",
      planId: "plan-free",
      status: "CANCELED",
      dodoSubscriptionId: null,
      dodoCustomerId: null,
      currentPeriodStart: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: true,
      videosUsedThisPeriod: 0,
      thumbnailsUsedThisPeriod: 0,
      paymentFailedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      plan: FREE_PLAN,
    });

    const { evaluateUploadAccess } = await import("./plan-guard.js");
    const result = await evaluateUploadAccess("user-1");
    expect(result.canUpload).toBe(false);
    expect(result.reason).toBe("SUBSCRIPTION_INACTIVE");
  });

  it("falls back to free plan when no subscription row exists", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.plan.findUnique).mockResolvedValue(FREE_PLAN);

    const { evaluateUploadAccess } = await import("./plan-guard.js");
    const result = await evaluateUploadAccess("user-1");
    expect(result.canUpload).toBe(true);
    expect(result.planKey).toBe("free");
    expect(result.videosAllowed).toBe(1);
  });
});