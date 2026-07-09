import type { Request, Response } from "express";
import type { Env } from "@clipflow/config";
import { sendOk } from "../../lib/response.js";
import { listPlans, getSubscription, createCheckout, openCustomerPortal, cancelScheduled } from "./service.js";
import type { CreateCheckoutInput } from "./schemas.js";

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