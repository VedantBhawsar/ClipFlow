import { Router } from "express";
import type { Env } from "@clipflow/config";
import { isBillingEnabled } from "@clipflow/config";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import {
  listPlansController,
  getSubscriptionController,
  createCheckoutController,
  openCustomerPortalController,
  cancelScheduledController,
  getBillingStatusController,
} from "./controller.js";
import { createCheckoutSchema, cancelScheduledSchema } from "./schemas.js";
import { handleWebhookEvent } from "./webhook-handler.js";

/**
 * Build the JSON billing router. When `BILLING_ENABLED=false`, every
 * route responds with 404 + `BILLING_DISABLED` so the web can rely on a
 * single error code instead of branching on env from the client. The
 * `/status` endpoint is NOT mounted here — it lives in
 * `buildBillingStatusRouter` and is always available so the web can
 * read the flag regardless.
 */
export function buildBillingRouter(env: Env): Router {
  const router = Router();

  if (!isBillingEnabled(env)) {
    // Catch-all: every method, every path → 404. The `/status` mount is
    // separate so it stays reachable.
    router.all("*", (_req, res) => {
      res.status(404).json({
        success: false,
        code: "BILLING_DISABLED",
        message: "Billing is disabled on this deployment.",
      });
    });
    return router;
  }

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

/**
 * Tiny router that ONLY exposes `/status`. Always mounted at
 * `/api/billing` — independent of the BILLING_ENABLED flag so the web
 * can render the correct chrome (pricing vs "coming soon") on first
 * load without polling.
 */
export function buildBillingStatusRouter(env: Env): Router {
  const router = Router();
  router.get("/status", getBillingStatusController(env));
  return router;
}

/**
 * Build the webhook router. When `BILLING_ENABLED=false`, ack every
 * delivery with 200 + `BILLING_DISABLED` so Dodo doesn't queue retries
 * for a deployment that intentionally doesn't process them. The
 * signature verification is intentionally skipped — there's nothing to
 * mutate when billing is off.
 */
export function buildBillingWebhookRouter(env: Env): Router {
  const router = Router();

  if (!isBillingEnabled(env)) {
    router.post("/dodo", (_req, res) => {
      res.status(200).json({
        received: true,
        billingDisabled: true,
        message: "Billing is disabled on this deployment; webhook ignored.",
      });
    });
    return router;
  }

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