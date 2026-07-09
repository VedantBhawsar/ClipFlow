import { z } from "zod";

const PAYMENT_PLAN_KEYS = ["starter", "creator", "pro"] as const;

export const createCheckoutSchema = z.object({
  planId: z.enum(PAYMENT_PLAN_KEYS, {
    errorMap: () => ({ message: "Plan must be one of: starter, creator, pro" }),
  }),
  country: z.string().length(2).optional(),
  billingCurrency: z.enum(["INR", "USD"]).optional(),
});

export const cancelScheduledSchema = z.object({});

export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;