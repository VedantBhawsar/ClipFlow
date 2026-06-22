import { describe, it, expect } from "vitest";
import { recommendPlan } from "./plan-recommendation.js";

describe("plan-recommendation", () => {
  it("returns 'starter' for ONE_TO_FOUR", () => {
    expect(recommendPlan("ONE_TO_FOUR")).toBe("starter");
  });

  it("returns 'creator' for FIVE_TO_TEN", () => {
    expect(recommendPlan("FIVE_TO_TEN")).toBe("creator");
  });

  it("returns 'creator' for ELEVEN_TO_TWENTY", () => {
    expect(recommendPlan("ELEVEN_TO_TWENTY")).toBe("creator");
  });

  it("returns 'pro' for TWENTY_PLUS", () => {
    expect(recommendPlan("TWENTY_PLUS")).toBe("pro");
  });
});
