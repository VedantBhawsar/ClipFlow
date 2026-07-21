import type { Request, Response } from "express";
import type { Env } from "@clipflow/config";
import { isBillingEnabled } from "@clipflow/config";
import { sendOk } from "../../lib/response.js";
import { listPlans, getSubscription, createCheckout, openCustomerPortal, cancelScheduled } from "./service.js";
import type { CreateCheckoutInput } from "./schemas.js";

/**
 * Public flag the web reads on app load to decide whether to render
 * pricing UI. Always mounted (even when BILLING_ENABLED=false) so the
 * web can render the "free unlimited" experience without an extra
 * code path on the client. No auth required — the flag is intentionally
 * not a secret.
 */
export const getBillingStatusController = (env: Env) => (_req: Request, res: Response) => {
  sendOk(res, { enabled: isBillingEnabled(env) }, "Billing status retrieved");
};

export const listPlansController = () => async (_req: Request, res: Response) => {
  const plans = await listPlans();
  sendOk(res, plans, "Plans retrieved");
};

export const getSubscriptionController = () => async (req: Request, res: Response) => {
  const result = await getSubscription(req.user!.id);
  sendOk(res, result, "Subscription retrieved");
};

export const createCheckoutController = (env: Env) => async (req: Request, res: Response) => {
  const input = req.body as CreateCheckoutInput;
  const result = await createCheckout(req.user!.id, input, env);
  sendOk(res, result, "Checkout session created");
};

export const openCustomerPortalController = () => async (req: Request, res: Response) => {
  const result = await openCustomerPortal(req.user!.id);
  sendOk(res, result, "Customer portal");
};

export const cancelScheduledController = () => async (req: Request, res: Response) => {
  const result = await cancelScheduled(req.user!.id);
  sendOk(res, result, "Subscription cancellation scheduled");
};