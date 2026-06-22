/**
 * User route definitions.
 *
 * Mounts under `/api/user` (the actual mount point is in `app.ts`).
 * This router owns:
 *   - GET /api/user/profile — combined user+profile+preferences+YouTube
 *     read, used by the dashboard hydration. Read-through cached.
 *   - GET /api/user/youtube-connection — narrow read for the
 *     /settings/connected page. Returns the same YouTube stub as the
 *     bundle so the two endpoints stay in sync.
 *
 * The preferences + change-password routes live in
 * `modules/preferences/preferences.routes.ts` but are mounted under
 * the same `/api/user` prefix in `app.ts`.
 */
import { Router } from "express";
import type { Env } from "@clipflow/config";
import { requireAuth } from "../../middleware/auth.js";
import { getUserBundleController } from "./user.controller.js";
import { stubbedYouTubeConnection } from "./user.service.js";
import "../auth/auth.types.js";

/**
 * Build the user router bound to the validated env.
 *
 * @param env Validated env.
 * @returns Configured Express router.
 */
export const buildUserRouter = (env: Env): Router => {
  const router = Router();
  const auth = requireAuth(env);

  router.get("/profile", auth, getUserBundleController);

  /**
   * Narrow YouTube-connection read. Returns the same stub the
   * bundle returns, so a page that only wants the connection state
   * (e.g. /settings/connected) can fetch it without paying for the
   * rest of the bundle. Not cached — this endpoint is rare and the
   * read is one query.
   */
  router.get("/youtube-connection", auth, async (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: "UNAUTHENTICATED", message: "Authentication required." });
      return;
    }
    res.status(200).json(stubbedYouTubeConnection());
  });

  return router;
};
