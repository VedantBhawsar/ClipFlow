/**
 * Auth controller.
 *
 * Adapts HTTP requests to the auth service. Keeps the request/response
 * shaping here so the service stays free of Express types. Every
 * response is emitted through the centralized `sendOk` / `sendCreated`
 * / `sendEmpty` helpers — there is no inline `res.status().json()`
 * in this file, by design.
 */
import type { NextFunction, Request, Response } from "express";
import type { Env } from "@clipflow/config";
import { sendCreated, sendEmpty, sendOk } from "../../lib/response.js";
import { AppError } from "../../errors/AppError.js";
import * as authService from "./auth.service.js";
import type {
  LogoutInput,
  RefreshInput,
  GoogleAuthInput,
  LoginInput,
  RegisterInput,
} from "./auth.schemas.js";
import "./auth.types.js";

export const registerController =
  (env: Env) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.body as RegisterInput;
      const result = await authService.register(input, env);
      sendCreated(res, result, "Account created.");
    } catch (err) {
      next(err);
    }
  };

export const loginController =
  (env: Env) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.body as LoginInput;
      const result = await authService.login(input, env);
      sendOk(res, result, "Signed in.");
    } catch (err) {
      next(err);
    }
  };

/**
 * POST /api/auth/refresh
 *
 * Body: `{ refreshToken: string }`. The refresh token IS the credential —
 * no `Authorization` header. On success, returns a fresh
 * `{ accessToken, refreshToken, ... }` pair along with the latest
 * `onboardingCompleted` and `displayName` so the NextAuth session JWT
 * stays current without forcing a re-login. On any failure (unknown,
 * expired, or reuse-detected), returns 401.
 */
export const refreshController =
  (env: Env) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.body as RefreshInput;
      const result = await authService.refresh(input.refreshToken, env);
      sendOk(res, result, "Token refreshed.");
    } catch (err) {
      next(err);
    }
  };

export const logoutController = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const input = (req.body ?? {}) as LogoutInput;
    await authService.logout(input);
    sendEmpty(res, "Signed out.");
  } catch (err) {
    next(err);
  }
};

export const googleController = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  void _res;
  try {
    const input = req.body as GoogleAuthInput;
    await authService.googleSignIn(input.idToken);
    // 501 Not Implemented — wraps the original AppError thrown inside the
    // service so it travels through the central error handler in the
    // envelope shape.
    throw new AppError(
      501,
      "NOT_IMPLEMENTED",
      "Google sign-in ships in the next slice.",
    );
  } catch (err) {
    next(err);
  }
};