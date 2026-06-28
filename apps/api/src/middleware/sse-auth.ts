/**
 * SSE authentication middleware.
 *
 * EventSource (the browser SSE API) does not support custom HTTP headers,
 * so the token is passed as a query parameter (`?token=...`). This
 * middleware reads it from the query, verifies the JWT, and attaches the
 * decoded identity to `req.user`.
 *
 * For non-SSE routes the standard `Authorization: Bearer` header-based
 * auth in `auth.ts` should be used instead.
 */
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError.js";
import { verifyJwt } from "../lib/jwt.js";
import type { Env } from "@clipflow/config";
import type { AuthUser } from "@clipflow/types";

export const requireSseAuth = (env: Env) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const token =
      (req.query as Record<string, string | undefined>).token ?? null;

    if (!token || token.length === 0) {
      next(
        new AppError(
          401,
          "UNAUTHENTICATED",
          "Authentication required. Provide a token query parameter.",
        ),
      );
      return;
    }

    try {
      const payload = verifyJwt(token, env);
      req.user = {
        id: payload.sub,
        email: payload.email,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
};
