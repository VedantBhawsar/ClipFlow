import { describe, it, expect } from "vitest";
import { toPlanDto, toSubscriptionDto } from "./types.js";

describe("toPlanDto", () => {
  it("maps plan to DTO", () => {
    const plan = {
      id: "plan-1",
      key: "starter",
      name: "Starter",
      priceUsd: 15,
      videosPerMonth: 5,
      thumbnailsPerVideo: 3,
      interval: "MONTH" as const,
      dodoProductId: "pdt_abc123",
      isHighlighted: false,
      sortOrder: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const dto = toPlanDto(plan);
    expect(dto.key).toBe("starter");
    expect(dto.priceUsd).toBe(15);
    expect(dto.videosPerMonth).toBe(5);
  });
});

describe("toSubscriptionDto", () => {
  it("maps subscription with plan to DTO", () => {
    const sub = {
      id: "sub-1",
      userId: "user-1",
      planId: "plan-1",
      status: "ACTIVE" as const,
      dodoSubscriptionId: "dsub_abc",
      dodoCustomerId: "dcus_abc",
      currentPeriodStart: new Date("2026-01-01"),
      currentPeriodEnd: new Date("2026-02-01"),
      cancelAtPeriodEnd: false,
      videosUsedThisPeriod: 3,
      thumbnailsUsedThisPeriod: 1,
      paymentFailedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      plan: {
        id: "plan-1",
        key: "starter",
        name: "Starter",
        priceUsd: 15,
        videosPerMonth: 5,
        thumbnailsPerVideo: 3,
        interval: "MONTH" as const,
        dodoProductId: "pdt_abc123",
        isHighlighted: false,
        sortOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
    const dto = toSubscriptionDto(sub);
    expect(dto.planKey).toBe("starter");
    expect(dto.status).toBe("ACTIVE");
    expect(dto.videosUsedThisPeriod).toBe(3);
    expect(dto.currentPeriodEnd).toContain("2026-02-01");
  });
});