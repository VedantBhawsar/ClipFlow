/**
 * Express app factory.
 *
 * Builds and configures the Express application, but does NOT call
 * `listen()` — that's `server.ts`. Separated for testability and for the
 * graceful-shutdown sequence (need to hold the `http.Server` handle).
 */
import express, { type Application } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { pinoHttp } from "pino-http";
import type { Env } from "@clipflow/config";
import { buildLogger, type Logger } from "./lib/logger.js";
// Side-effect import — patches Express 4's Layer.handle_request so
// async rejections flow into next(err) instead of becoming
// unhandledRejection. Must come AFTER `import express` and BEFORE
// any Router() construction. See lib/async-handler.ts for the why.
import "./lib/async-handler.js";
import { buildErrorHandler, notFoundHandler } from "./middleware/error.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { buildGlobalRateLimiter } from "./middleware/rate-limit.js";
import { buildAuthRouter } from "./modules/auth/auth.routes.js";
import { buildOnboardingRouter } from "./modules/onboarding/onboarding.routes.js";
import { buildHealthRouter } from "./modules/health/health.routes.js";
import { buildPreferencesRouter } from "./modules/preferences/preferences.routes.js";
import { buildSettingsRouter } from "./modules/settings/settings.routes.js";
import { buildVideosRouter } from "./modules/videos/videos.routes.js";
import { buildYouTubeRouter } from "./modules/youtube/youtube.routes.js";

/**
 * Options accepted by `createApp`.
 */
export interface CreateAppOptions {
  env: Env;
  logger?: Logger;
}

/**
 * Build the Express application.
 *
 * @param options Validated env + optional pre-built logger (for tests).
 * @returns A fully configured Express application (not yet listening).
 */
export const createApp = ({ env, logger }: CreateAppOptions): Application => {
  const log = logger ?? buildLogger(env);
  const app = express();

  // Trust the X-Forwarded-* headers set by the reverse proxy (Caddy/Nginx
  // in production). One hop is enough for our setup.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  // Store validated env on the app instance so controllers can reach it
  // via req.app.get("env") without each router having to pass it through.
  app.set("env", env);

  // Request-ID must run before the logger so the log line can reference it.
  app.use(requestIdMiddleware);
  app.use(
    pinoHttp({
      logger: log,
      genReqId: (req, res) => {
        // The request-id middleware sets both `req.id` and the response
        // header. If for some reason it didn't run, fall back to a header
        // value or empty string (pino-http will generate one otherwise).
        const fromReq = (req as unknown as { id?: string }).id;
        if (fromReq) return fromReq;
        const headerId = res.getHeader("X-Request-Id");
        return typeof headerId === "string" ? headerId : "";
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
      customSuccessMessage: (req, res) =>
        `${req.method} ${(req.url ?? "").split("?")[0]} ${res.statusCode}`,
      customErrorMessage: (req, res, err) =>
        `${req.method} ${(req.url ?? "").split("?")[0]} ${res.statusCode} ${err.message}`,
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: false, // CSP isn't useful for a JSON API.
    }),
  );
  app.use(
    compression({
      // Don't compress SSE event streams — compression buffers the
      // response, which prevents the EventSource from receiving data.
      filter: (req, res) => {
        if (req.url?.includes("/stream")) return false;
        return compression.filter(req, res);
      },
    }),
  );
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
    }),
  );

  // JSON body parser with a sensible size limit. Upload routes will be
  // mounted at a higher limit when they're built (this app doesn't proxy
  // uploads in v1 — direct-to-S3 — but the limit is here so the rest of
  // the API is bounded).
  app.use(express.json({ limit: "1mb" }));

  // Global rate limiter. Stricter auth limits are layered on inside the
  // auth router.
  app.use(buildGlobalRateLimiter(env));

  // Routes.
  app.use("/health", buildHealthRouter());
  app.use("/api/auth", buildAuthRouter(env));
  app.use("/api/onboarding", buildOnboardingRouter(env));
  // /api/settings owns the lazy settings-bundle read (GET /). The
  // narrower writes (PATCH /preferences, POST /change-password) are
  // mounted under the same prefix from the existing preferences
  // router so the URL space stays a single tree. The combined-read
  // user/bundle router is gone — the dashboard chrome reads identity
  // + onboarding status straight from the NextAuth session JWT.
  app.use("/api/settings", buildSettingsRouter(env));
  app.use("/api/settings", buildPreferencesRouter(env));
  app.use("/api/youtube", buildYouTubeRouter(env));
  app.use("/api/videos", buildVideosRouter(env));

  // 404 + error handler must be last.
  app.use(notFoundHandler);
  app.use(buildErrorHandler(log));

  return app;
};
