import crypto from "node:crypto";
import type { Env } from "@clipflow/config";
import { AppError } from "../../errors/AppError.js";
import { prisma } from "../../lib/prisma.js";
import { requireDatabase } from "../../lib/db-guard.js";
import { hashPassword } from "../../lib/password.js";
import { sendPasswordResetEmail } from "../../lib/email.js";
import type { ForgotPasswordInput, ResetPasswordInput } from "./password-reset.schemas.js";

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000;
const TOKEN_BYTES = 32;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateRawToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("hex");
}

export async function forgotPassword(input: ForgotPasswordInput, env: Env): Promise<void> {
  requireDatabase();

  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, email: true, name: true, passwordHash: true },
  });

  if (!user || !user.passwordHash) {
    return;
  }

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });

  await sendPasswordResetEmail({
    env,
    to: user.email,
    name: user.name,
    resetToken: rawToken,
  });
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  requireDatabase();

  const tokenHash = hashToken(input.token);

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, email: true } } },
  });

  if (!resetToken) {
    throw new AppError(400, "INVALID_RESET_TOKEN", "This reset link is invalid. Request a new one.");
  }

  if (resetToken.usedAt) {
    throw new AppError(400, "TOKEN_ALREADY_USED", "This reset link has already been used. Request a new one.");
  }

  if (resetToken.expiresAt < new Date()) {
    throw new AppError(400, "TOKEN_EXPIRED", "This reset link has expired. Request a new one.");
  }

  const passwordHash = await hashPassword(input.password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
  ]);
}
