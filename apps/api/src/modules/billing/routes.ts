import { Router } from "express";
import type { Env } from "@clipflow/config";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import {
  listPlansController,
  getSubscriptionController,
  createCheckoutController,
  openCustomerPortalController,
  cancelScheduledController,
} from "./controller.js";
import { createCheckoutSchema, cancelScheduledSchema } from "./schemas.js";
import { handleWebhookEvent } from "./webhook-handler.js";

export function buildBillingRouter(env: Env): Router {
  const router = Router();
  const auth = requireAuth(env);

  router.get("/plans", listPlansController());

  router.get("/subscription", auth, getSubscriptionController());

  router.post(
    "/checkout",
    auth,
    validate({ body: createCheckoutSchema }),
    createCheckoutController(env),
  );

  router.post(
    "/customer-portal",
    auth,
    openCustomerPortalController(),
  );

  router.post(
    "/cancel-scheduled",
    auth,
    validate({ body: cancelScheduledSchema }),
    cancelScheduledController(),
  );

  return router;
}

export function buildBillingWebhookRouter(env: Env): Router {
  const router = Router();

  router.post("/dodo", async (req, res) => {
    try {
      const rawBody = req.body as Buffer;
      const signatureHeader = req.headers["webhook-signature"] as string | undefined;
      const eventId = req.headers["webhook-id"] as string | undefined;
      const timestamp = req.headers["webhook-timestamp"] as string | undefined;

      if (!signatureHeader || !eventId || !timestamp) {
        res.status(400).json({ success: false, message: "Missing webhook headers" });
        return;
      }

      await handleWebhookEvent({
        rawBody,
        signatureHeader,
        eventId,
        timestamp,
        env,
      });

      res.status(200).json({ received: true });
    } catch (err) {
      const appErr = err as { statusCode?: number; code?: string; message?: string };
      if (appErr.statusCode === 400 || appErr.statusCode === 401) {
        res.status(appErr.statusCode).json({
          received: false,
          error: appErr.code ?? "WEBHOOK_REJECTED",
          message: appErr.message ?? "Webhook rejected",
        });
        return;
      }
      res.status(500).json({ received: false, error: "WEBHOOK_HANDLER_ERROR" });
    }
  });

  return router;
}