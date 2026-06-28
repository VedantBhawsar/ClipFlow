/**
 * Refresh-token rotation primitives.
 *
 * Implements the standard OAuth 2.0 refresh-token rotation pattern with
 * family-based reuse detection:
 *
 *   1. Each login creates a new "family" and issues the first token.
 *   2. Each successful /api/auth/refresh marks the presented token as
 *      revoked and mints a new one in the SAME family.
 *   3. If a token that has ALREADY been revoked is presented again,
 *      we revoke the entire family. This is the standard OAuth 2.0
 *      protection against stolen-token replay — a thief trying to use
 *      a token the legitimate user already rotated past tips us off,
 *      and the legitimate user is forced to re-authenticate.
 *
 * Tokens are 32 random bytes base64url-encoded. We persist only the
 * SHA-256 hash of the token; the raw value is sent to the client and
 * never stored. A DB compromise cannot replay active sessions.
 */
import { randomBytes, createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { Env } from "@clipflow/config";
import { AppError } from "../errors/AppError.js";
import { signJwt } from "./jwt.js";

export interface MintedToken {
  /** Raw token sent to the client in the response. */
  rawToken: string;
  /** SHA-256 hash (hex) persisted in the DB. */
  tokenHash: string;
  /** When the token expires. */
  expiresAt: Date;
}

const DURATION_UNITS_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/**
 * Parse a duration string like "7d", "15m", "30s" into milliseconds.
 * Supports ms/s/m/h/d/w units. Throws on invalid input — config-time
 * values are validated up front, so a runtime parse error indicates a
 * programming bug.
 */
export function parseDurationMs(input: string): number {
  const match = /^(\d+)(ms|s|m|h|d|w)$/.exec(input.trim());
  if (!match) {
    throw new Error(`Invalid duration: ${input}`);
  }
  const n = parseInt(match[1]!, 10);
  const unit = match[2] || 'ms';
  return n * DURATION_UNITS_MS[unit]!;
}

/**
 * Generate a new refresh token. 32 random bytes base64url-encoded
 * (~43 chars, ~192 bits of entropy). Returns the raw value (for the
 * client) and the SHA-256 hash (for the DB).
 */
export function mintRefreshToken(ttlMs: number, now: Date = new Date()): MintedToken {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(now.getTime() + ttlMs);
  return { rawToken, tokenHash, expiresAt };
}

/**
 * SHA-256 hash a raw refresh token. Stable, deterministic, used for
 * DB lookup. Stored hex-encoded for readability.
 */
export function hashRefreshToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export interface RefreshIssueOptions {
  /** Lifetime of the new token, in ms. */
  ttlMs: number;
  /** Best-effort audit fields. Optional. */
  userAgent?: string | null;
  ip?: string | null;
  /** Override `new Date()` for deterministic tests. */
  now?: Date;
}

/**
 * Issue the FIRST refresh token of a new family. Used by login/register.
 *
 * The new row's `familyId` is a fresh random 16-byte value — there is
 * no chain to attach to yet.
 */
export async function issueRefreshToken(
  prisma: PrismaClient,
  userId: string,
  opts: RefreshIssueOptions,
): Promise<{ rawToken: string; familyId: string; expiresAt: Date }> {
  const now = opts.now ?? new Date();
  const minted = mintRefreshToken(opts.ttlMs, now);
  const familyId = randomBytes(16).toString("base64url");
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: minted.tokenHash,
      familyId,
      expiresAt: minted.expiresAt,
      userAgent: opts.userAgent ?? null,
      ip: opts.ip ?? null,
    },
  });
  return { rawToken: minted.rawToken, familyId, expiresAt: minted.expiresAt };
}

/**
 * Rotate a refresh token. On success, returns a fresh (accessToken,
 * refreshToken) pair. The previous refresh token is marked as revoked;
 * the new one belongs to the SAME family.
 *
 * Reuse detection: if the presented token has already been revoked,
 * we revoke the ENTIRE family and throw 401. This is what catches
 * stolen tokens — a legitimate user presenting a fresh token would
 * not have triggered a rotation yet, so this can only happen if
 * someone is replaying a token we've already invalidated.
 */
export async function rotateRefreshToken(
  prisma: PrismaClient,
  presentedRaw: string,
  env: Env,
  opts: RefreshIssueOptions,
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  userId: string;
  familyId: string;
}> {
  const now = opts.now ?? new Date();
  const tokenHash = hashRefreshToken(presentedRaw);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!existing) {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid.");
  }

  if (existing.revokedAt) {
    // REUSE DETECTED. Burn the whole family.
    await prisma.refreshToken.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: now },
    });
    throw new AppError(
      401,
      "INVALID_REFRESH_TOKEN",
      "Refresh token reuse detected. Please sign in again.",
    );
  }

  if (existing.expiresAt < now) {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "Refresh token has expired.");
  }

  // Mark this token as revoked (rotated).
  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: now },
  });

  // Mint the next token in the same family.
  const minted = mintRefreshToken(opts.ttlMs, now);
  await prisma.refreshToken.create({
    data: {
      userId: existing.userId,
      tokenHash: minted.tokenHash,
      familyId: existing.familyId,
      expiresAt: minted.expiresAt,
      userAgent: opts.userAgent ?? null,
      ip: opts.ip ?? null,
    },
  });

  // Sign a fresh access JWT. Needs the user's email for the claim.
  const user = await prisma.user.findUnique({ where: { id: existing.userId } });
  if (!user) {
    // Edge case: user was deleted between issuing and rotating. The
    // rotated token still works for THIS request, but no email means
    // we can't issue a JWT with the right claims. Fail loudly.
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "User no longer exists.");
  }
  const accessToken = signJwt({ sub: user.id, email: user.email }, env);

  return {
    accessToken,
    refreshToken: minted.rawToken,
    expiresAt: minted.expiresAt,
    userId: existing.userId,
    familyId: existing.familyId,
  };
}

/**
 * Mark a single refresh token as revoked. Idempotent: revoking an
 * already-revoked token is a no-op (returns without error). Used by
 * the logout endpoint.
 */
export async function revokeRefreshToken(
  prisma: PrismaClient,
  presentedRaw: string,
  now: Date = new Date(),
): Promise<void> {
  const tokenHash = hashRefreshToken(presentedRaw);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: now },
  });
}

/**
 * Revoke every token in a family. Returns the count of newly revoked
 * rows. Used by reuse detection (and "log out everywhere" if added
 * later).
 */
export async function revokeFamily(
  prisma: PrismaClient,
  familyId: string,
  now: Date = new Date(),
): Promise<number> {
  const result = await prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: now },
  });
  return result.count;
}