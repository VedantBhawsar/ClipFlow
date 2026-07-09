import { describe, it, expect } from "vitest";
import { createCheckoutSchema } from "./schemas.js";

describe("createCheckoutSchema", () => {
  it("accepts a valid paid plan id", () => {
    const result = createCheckoutSchema.safeParse({ planId: "starter" });
    expect(result.success).toBe(true);
  });

  it("rejects 'free' as a plan id", () => {
    const result = createCheckoutSchema.safeParse({ planId: "free" });
    expect(result.success).toBe(false);
  });

  it("rejects unknown plan id", () => {
    const result = createCheckoutSchema.safeParse({ planId: "platinum" });
    expect(result.success).toBe(false);
  });

  it("allows INR and USD billing currency", () => {
    const a = createCheckoutSchema.safeParse({ planId: "starter", billingCurrency: "INR" });
    const b = createCheckoutSchema.safeParse({ planId: "starter", billingCurrency: "USD" });
    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
  });

  it("rejects invalid billing currency", () => {
    const result = createCheckoutSchema.safeParse({ planId: "starter", billingCurrency: "EUR" });
    expect(result.success).toBe(false);
  });

  it("allows optional country field", () => {
    const result = createCheckoutSchema.safeParse({ planId: "creator", country: "IN" });
    expect(result.success).toBe(true);
  });
});