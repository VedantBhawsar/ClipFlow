/**
 * User route definitions.
 *
 * Mounts under `/api/user` (the actual mount point is in `app.ts`).
 * This router owns:
 *   - GET /api/user/profile — combined user+profile+preferences+YouTube
 *     read, used by the dashboard hydration. Read-through cached.
 *   - GET /api/user/youtube-connection — narrow read for the
 *     /settings/connected page. Uses the same real YouTube connection
 *     data as the bundle so the two endpoints stay in sync.
 *
 * The preferences + change-password routes live in
 * `modules/preferences/preferences.routes.ts` but are mounted under
 * the same `/api/user` prefix in `app.ts`.
 */
import { Router } from "express";
import type { Env } from "@clipflow/config";
import { requireAuth } from "../../middleware/auth.js";
import { getUserBundleController } from "./user.controller.js";
import { getYouTubeConnectionByUserId } from "../youtube/youtube.service.js";
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
   * Narrow YouTube-connection read. Returns the same YouTube connection
   * data as the bundle so pages that only want the connection state can
   * fetch it without paying for the rest of the bundle.
   */
  router.get("/youtube-connection", auth, async (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: "UNAUTHENTICATED", message: "Authentication required." });
      return;
    }
    const connection = await getYouTubeConnectionByUserId(req.user.id);
    res.status(200).json(connection);
  });

  return router;
};
