/**
 * JWT helpers.
 *
 * Centralizes the `jsonwebtoken` calls so the rest of the codebase never
 * touches the library directly. Used by auth.service to issue session
 * tokens and by middleware/auth.ts to verify them.
 */
import jwt from "jsonwebtoken";
import { AppError } from "../errors/AppError.js";
import type { Env } from "@clipflow/config";

/**
 * Decoded JWT payload shape for ClipFlow session tokens.
 */
export interface JwtPayload {
  sub: string;
  email: string;
}

/**
 * Sign a session JWT for a user.
 *
 * @param payload User identity to embed in the token (`sub` = userId, `email`).
 * @param env Validated env (uses `JWT_SECRET` + `JWT_EXPIRES_IN`).
 * @returns Compact JWT string suitable for `Authorization: Bearer <token>`.
 */
export const signJwt = (payload: JwtPayload, env: Env): string => {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
};

/**
 * Verify a JWT and return its decoded payload.
 *
 * @param token The raw token (without the `Bearer ` prefix).
 * @param env Validated env (uses `JWT_SECRET`).
 * @returns Decoded payload.
 * @throws AppError(401, "INVALID_TOKEN") if the token is malformed, expired,
 *   or signed with a different secret.
 */
export const verifyJwt = (token: string, env: Env): JwtPayload => {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
    if (typeof decoded !== "object" || decoded === null) {
      throw new AppError(401, "INVALID_TOKEN", "Token payload is invalid.");
    }
    const payload = decoded as Record<string, unknown>;
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      throw new AppError(401, "INVALID_TOKEN", "Token payload is missing required claims.");
    }
    return { sub: payload.sub, email: payload.email };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(401, "INVALID_TOKEN", "Token is invalid or expired.");
  }
};
