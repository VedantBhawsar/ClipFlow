/**
 * Authentication middleware.
 *
 * Reads the `Authorization: Bearer <token>` header, verifies the JWT, and
 * attaches the decoded identity to `req.user`. Routes that need auth use
 * `requireAuth`; routes that need an optional auth use `optionalAuth`.
 *
 * The TypeScript augmentation lives in `modules/auth/auth.types.ts` so the
 * shape is co-located with the rest of the auth module.
 */
import type { NextFunction, Request, Response } from "express";
// Side-effect: load the Express `Request` augmentations (`req.id`,
// `req.user`). This middleware is transitively pulled in by every
// authenticated route, so the augmentation reaches every controller.
import "../types/express.js";
import { AppError } from "../errors/AppError.js";
import { verifyJwt } from "../lib/jwt.js";
import type { Env } from "@clipflow/config";
import type { AuthUser } from "@clipflow/types";

/**
 * Build the `requireAuth` middleware bound to the validated env (so it
 * can verify JWTs without re-importing config).
 *
 * @param env Validated env (provides `JWT_SECRET`).
 * @returns Express middleware that enforces auth and attaches `req.user`.
 */
export const requireAuth = (env: Env) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.header("authorization");
    if (!header || !header.toLowerCase().startsWith("bearer ")) {
      next(
        new AppError(
          401,
          "UNAUTHENTICATED",
          "Authentication required. Sign in to continue.",
        ),
      );
      return;
    }
    const token = header.slice("bearer ".length).trim();
    if (token.length === 0) {
      next(
        new AppError(401, "UNAUTHENTICATED", "Authentication token is missing."),
      );
      return;
    }

    try {
      const payload = verifyJwt(token, env);
      const user: AuthUser = {
        id: payload.sub,
        email: payload.email,
        // Other fields are populated by controllers/services that fetch the
        // full user row — middleware only needs identity for routing.
        name: null,
        authProvider: "EMAIL",
        emailVerifiedAt: null,
        createdAt: new Date(0).toISOString(),
      };
      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
};
