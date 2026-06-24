/**
 * Auth service.
 *
 * All auth-domain business logic lives here. Controllers stay thin and
 * delegate to this module — easy to unit-test in isolation, and keeps
 * the HTTP/Express concerns out of the data layer.
 *
 * Token model:
 *  - Access: short-lived HS256 JWT (15m default, env-controlled). Carried
 *    in `Authorization: Bearer <accessToken>` on every authenticated
 *    request. Verified by `middleware/auth.ts`.
 *  - Refresh: long-lived opaque token (7d default, env-controlled). Sent
 *    in the body of `POST /api/auth/refresh`. Stored as a SHA-256 hash
 *    server-side. Rotation + reuse detection — see `lib/refresh-token.ts`.
 */
import type {
  AuthProvider,
  AuthResponse,
  AuthUser,
  LogoutRequest,
  MeResponse,
  RefreshResponse,
  UserProfile,
} from "@clipflow/types";
import { AppError } from "../../errors/AppError.js";
import { prisma } from "../../lib/prisma.js";
import { requireDatabase } from "../../lib/db-guard.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { signJwt } from "../../lib/jwt.js";
import {
  issueRefreshToken,
  parseDurationMs,
  revokeRefreshToken,
  rotateRefreshToken,
} from "../../lib/refresh-token.js";
import type { Env } from "@clipflow/config";
import type { LoginInput, RegisterInput } from "./auth.schemas.js";

const refreshTtlMs = (env: Env): number => parseDurationMs(env.REFRESH_TOKEN_EXPIRES_IN);

const accessTtlMs = (env: Env): number => parseDurationMs(env.JWT_EXPIRES_IN);

/**
 * Map a Prisma `User` row to the wire-format `AuthUser` DTO.
 */
const toAuthUser = (user: {
  id: string;
  email: string;
  name: string | null;
  authProvider: AuthProvider;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}): AuthUser => {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    authProvider: user.authProvider,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
};

/**
 * Map a Prisma `UserProfile` row to the wire-format `UserProfile` DTO,
 * or `null` if no row exists.
 */
const toProfileDto = (
  profile:
    | {
        id: string;
        displayName: string | null;
        niche: string | null;
        uploadFrequency: string | null;
        primaryGoal: string | null;
        recommendedPlanId: string | null;
        onboardingCompletedAt: Date | null;
      }
    | null,
): UserProfile | null => {
  if (!profile) return null;
  return {
    id: profile.id,
    displayName: profile.displayName,
    niche: profile.niche as UserProfile["niche"],
    uploadFrequency: profile.uploadFrequency as UserProfile["uploadFrequency"],
    primaryGoal: profile.primaryGoal as UserProfile["primaryGoal"],
    recommendedPlanId: profile.recommendedPlanId,
    onboardingCompletedAt: profile.onboardingCompletedAt?.toISOString() ?? null,
  };
};

/**
 * Mint a fresh access JWT + refresh-token row and combine into the
 * wire-format `AuthResponse`. Caller passes the user (already loaded)
 * to avoid a second DB hit.
 */
const mintAuthResponse = async (
  user: {
    id: string;
    email: string;
    name: string | null;
    authProvider: AuthProvider;
    emailVerifiedAt: Date | null;
    createdAt: Date;
  },
  env: Env,
): Promise<AuthResponse> => {
  const accessToken = signJwt({ sub: user.id, email: user.email }, env);
  const refresh = await issueRefreshToken(prisma, user.id, {
    ttlMs: refreshTtlMs(env),
  });
  return {
    user: toAuthUser(user),
    accessToken,
    refreshToken: refresh.rawToken,
    accessTokenExpiresAt: Date.now() + accessTtlMs(env),
    refreshTokenExpiresAt: refresh.expiresAt.getTime(),
  };
};

/**
 * Register a new email/password user. Throws `EMAIL_TAKEN` if the email
 * is already in use.
 */
export const register = async (
  input: RegisterInput,
  env: Env,
): Promise<AuthResponse> => {
  requireDatabase();
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError(
      409,
      "EMAIL_TAKEN",
      "An account with that email already exists.",
    );
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name ?? null,
      authProvider: "EMAIL",
    },
  });

  return mintAuthResponse(user, env);
};

/**
 * Authenticate an existing user. Throws `INVALID_CREDENTIALS` on bad
 * email or password — single generic message to avoid leaking whether
 * the email exists.
 */
export const login = async (input: LoginInput, env: Env): Promise<AuthResponse> => {
  requireDatabase();
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !user.passwordHash) {
    throw new AppError(
      401,
      "INVALID_CREDENTIALS",
      "Email or password is incorrect.",
    );
  }
  const matches = await verifyPassword(input.password, user.passwordHash);
  if (!matches) {
    throw new AppError(
      401,
      "INVALID_CREDENTIALS",
      "Email or password is incorrect.",
    );
  }
  return mintAuthResponse(user, env);
};

/**
 * Rotate a refresh token. Throws `INVALID_REFRESH_TOKEN` (401) on any
 * failure: unknown token, expired token, or REUSE DETECTED (the latter
 * also revokes the entire family as a side effect).
 */
export const refresh = async (
  presentedRefreshToken: string,
  env: Env,
): Promise<RefreshResponse> => {
  requireDatabase();
  const rotated = await rotateRefreshToken(
    prisma,
    presentedRefreshToken,
    env,
    { ttlMs: refreshTtlMs(env) },
  );
  return {
    accessToken: rotated.accessToken,
    refreshToken: rotated.refreshToken,
    accessTokenExpiresAt: Date.now() + accessTtlMs(env),
    refreshTokenExpiresAt: rotated.expiresAt.getTime(),
  };
};

/**
 * Logout. Revokes the presented refresh token (if any). Idempotent —
 * the access token is client-discarded; only the refresh token is
 * stored server-side and worth revoking.
 */
export const logout = async (input: LogoutRequest | undefined): Promise<void> => {
  if (!input?.refreshToken) return;
  requireDatabase();
  await revokeRefreshToken(prisma, input.refreshToken);
};

/**
 * Google sign-in. Stub for the next slice: returns 501 so the route is
 * obviously wired and the controller contract is exercised end-to-end.
 */
export const googleSignIn = async (_idToken: string): Promise<AuthResponse> => {
  throw new AppError(
    501,
    "NOT_IMPLEMENTED",
    "Google sign-in ships in the next slice.",
  );
};

/**
 * Fetch the authenticated user along with their profile (if any) and
 * onboarding completion flag. Used by `GET /api/auth/me`.
 */
export const me = async (userId: string): Promise<MeResponse> => {
  requireDatabase();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });
  if (!user) {
    throw new AppError(401, "UNAUTHENTICATED", "Your session is no longer valid.");
  }
  const profile = toProfileDto(user.profile);
  return {
    user: toAuthUser(user),
    profile,
    onboardingCompleted: profile?.onboardingCompletedAt != null,
  };
};