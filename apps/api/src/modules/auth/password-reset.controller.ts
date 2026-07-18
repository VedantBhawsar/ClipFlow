import type { NextFunction, Request, Response } from "express";
import type { Env } from "@clipflow/config";
import { sendOk } from "../../lib/response.js";
import * as passwordResetService from "./password-reset.service.js";
import type { ForgotPasswordInput, ResetPasswordInput } from "./password-reset.schemas.js";

export const forgotPasswordController = (env: Env) => async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const input = req.body as ForgotPasswordInput;
    await passwordResetService.forgotPassword(input, env);
    sendOk(res, null, "If an account with that email exists, we've sent a password reset link.");
  } catch (err) {
    next(err);
  }
};

export const resetPasswordController = () => async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const input = req.body as ResetPasswordInput;
    await passwordResetService.resetPassword(input);
    sendOk(res, null, "Password reset successfully. You can now sign in with your new password.");
  } catch (err) {
    next(err);
  }
};
