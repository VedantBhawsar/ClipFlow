/**
 * Auth service.
 *
 * All auth-domain business logic lives here. Controllers stay thin and
 * delegate to this module — easy to unit-test in isolation, and keeps
 * the HTTP/Express concerns out of the data layer.
 */
import type { AuthProvider, AuthResponse, AuthUser, MeResponse, UserProfile } from "@clipflow/types";
import { AppError } from "../../errors/AppError.js";
import { prisma } from "../../lib/prisma.js";
import { requireDatabase } from "../../lib/db-guard.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { signJwt } from "../../lib/jwt.js";
import type { Env } from "@clipflow/config";
import type { LoginInput, RegisterInput } from "./auth.schemas.js";

/**
 * Map a Prisma `User` row to the wire-format `AuthUser` DTO.
 *
 * @param user The Prisma row.
 * @returns DTO suitable for `AuthResponse.user`.
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
 *
 * @param profile The Prisma row or `null`.
 * @returns DTO suitable for `MeResponse.profile`.
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
    // Casts: Prisma returns the enum values as strings; the DTO accepts the
    // matching string union types. Safe because the columns are constrained
    // by the Prisma enum.
    niche: profile.niche as UserProfile["niche"],
    uploadFrequency: profile.uploadFrequency as UserProfile["uploadFrequency"],
    primaryGoal: profile.primaryGoal as UserProfile["primaryGoal"],
    recommendedPlanId: profile.recommendedPlanId,
    onboardingCompletedAt: profile.onboardingCompletedAt?.toISOString() ?? null,
  };
};

/**
 * Register a new email/password user. Throws `EMAIL_TAKEN` if the email
 * is already in use.
 *
 * @param input Validated register input.
 * @param env Validated env (for JWT signing).
 * @returns `AuthResponse` for the newly created user.
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

  const token = signJwt({ sub: user.id, email: user.email }, env);

  return {
    user: toAuthUser(user),
    token,
  };
};

/**
 * Authenticate an existing user. Throws `INVALID_CREDENTIALS` on bad
 * email or password — single generic message to avoid leaking whether
 * the email exists.
 *
 * @param input Validated login input.
 * @param env Validated env (for JWT signing).
 * @returns `AuthResponse` on success.
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
  const token = signJwt({ sub: user.id, email: user.email }, env);
  return {
    user: toAuthUser(user),
    token,
  };
};

/**
 * Logout. Stateless JWT — the client drops the token. This route is
 * reserved for a future token blacklist / refresh-token rotation flow.
 * Always returns 204.
 */
export const logout = async (): Promise<void> => {
  return Promise.resolve();
};

/**
 * Google sign-in. Stub for the next slice: returns 501 so the route is
 * obviously wired and the controller contract is exercised end-to-end.
 *
 * The scaffolding is intentionally real (validation + controller + service
 * call), only the actual token verification is deferred.
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
 *
 * @param userId The authenticated user's id (from JWT).
 * @returns `MeResponse`.
 */
export const me = async (userId: string): Promise<MeResponse> => {
  requireDatabase();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });
  if (!user) {
    // Token references a deleted user — treat as unauthenticated.
    throw new AppError(401, "UNAUTHENTICATED", "Your session is no longer valid.");
  }
  const profile = toProfileDto(user.profile);
  return {
    user: toAuthUser(user),
    profile,
    onboardingCompleted: profile?.onboardingCompletedAt != null,
  };
};
