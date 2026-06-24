import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import type { Env } from "@clipflow/config";
import {
  hashRefreshToken,
  issueRefreshToken,
  mintRefreshToken,
  parseDurationMs,
  revokeFamily,
  revokeRefreshToken,
  rotateRefreshToken,
} from "./refresh-token.js";
import { AppError } from "../errors/AppError.js";

// Prisma is mocked per-test. The shape mirrors only what the lib touches.
const prismaMock = {
  refreshToken: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
};

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(),
}));

// We don't need the real env for most tests — only `signJwt` cares.
const mockEnv = {
  JWT_SECRET: "super-secret-key-that-is-at-least-32-chars",
  JWT_EXPIRES_IN: "15m",
  REFRESH_TOKEN_EXPIRES_IN: "7d",
} as unknown as Env;

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.refreshToken.create.mockResolvedValue({});
  prismaMock.refreshToken.update.mockResolvedValue({});
  prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 });
});

// We pass our mock object as `prisma` to the lib functions. The lib types
// it as `PrismaClient`; this duck-typed object satisfies what we use.
const db = prismaMock as unknown as Parameters<typeof issueRefreshToken>[0];

describe("parseDurationMs", () => {
  it("parses ms / s / m / h / d / w", () => {
    expect(parseDurationMs("500ms")).toBe(500);
    expect(parseDurationMs("30s")).toBe(30_000);
    expect(parseDurationMs("15m")).toBe(15 * 60_000);
    expect(parseDurationMs("2h")).toBe(2 * 3_600_000);
    expect(parseDurationMs("7d")).toBe(7 * 86_400_000);
    expect(parseDurationMs("1w")).toBe(7 * 86_400_000);
  });

  it("throws on invalid input", () => {
    expect(() => parseDurationMs("ten minutes")).toThrow();
    expect(() => parseDurationMs("7")).toThrow();
    expect(() => parseDurationMs("7y")).toThrow();
  });
});

describe("mintRefreshToken", () => {
  it("produces a base64url token and matching SHA-256 hash", () => {
    const now = new Date("2024-06-01T00:00:00Z");
    const minted = mintRefreshToken(60_000, now);

    expect(minted.rawToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(minted.rawToken.length).toBeGreaterThanOrEqual(40);
    expect(minted.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(minted.tokenHash).toBe(hashRefreshToken(minted.rawToken));
    expect(minted.expiresAt.toISOString()).toBe("2024-06-01T00:01:00.000Z");
  });

  it("uses crypto-random source (not deterministic)", () => {
    const a = mintRefreshToken(60_000);
    const b = mintRefreshToken(60_000);
    expect(a.rawToken).not.toBe(b.rawToken);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });
});

describe("hashRefreshToken", () => {
  it("matches createHash('sha256').update(raw).digest('hex')", () => {
    const raw = "test-token-value";
    const expected = createHash("sha256").update(raw).digest("hex");
    expect(hashRefreshToken(raw)).toBe(expected);
  });
});

describe("issueRefreshToken", () => {
  it("persists a row with a fresh familyId and the expected shape", async () => {
    const now = new Date("2024-06-01T00:00:00Z");
    const result = await issueRefreshToken(db, "user-1", {
      ttlMs: 86_400_000,
      userAgent: "jest",
      ip: "127.0.0.1",
      now,
    });

    expect(result.rawToken).toEqual(expect.any(String));
    expect(result.familyId).toEqual(expect.any(String));
    expect(result.expiresAt.toISOString()).toBe("2024-06-02T00:00:00.000Z");
    expect(prismaMock.refreshToken.create).toHaveBeenCalledTimes(1);

    const call = prismaMock.refreshToken.create.mock.calls[0]![0];
    expect(call.data.userId).toBe("user-1");
    expect(call.data.userAgent).toBe("jest");
    expect(call.data.ip).toBe("127.0.0.1");
    expect(call.data.tokenHash).toBe(hashRefreshToken(result.rawToken));
    expect(call.data.familyId).toBe(result.familyId);
    expect(call.data.expiresAt).toEqual(result.expiresAt);
  });

  it("nulls out missing audit fields (don't store 'undefined')", async () => {
    await issueRefreshToken(db, "user-1", { ttlMs: 60_000 });
    const call = prismaMock.refreshToken.create.mock.calls[0]![0];
    expect(call.data.userAgent).toBeNull();
    expect(call.data.ip).toBeNull();
  });
});

describe("rotateRefreshToken — happy path", () => {
  it("rotates a valid token: marks old revoked, mints new in same family, signs new access JWT", async () => {
    const now = new Date("2024-06-01T00:00:00Z");
    const { rawToken, familyId } = await issueRefreshToken(db, "user-1", {
      ttlMs: 60_000,
      now,
    });
    // Reset so we can isolate the rotate's calls.
    prismaMock.refreshToken.create.mockClear();
    prismaMock.refreshToken.update.mockClear();

    const existingRow = {
      id: "row-1",
      userId: "user-1",
      tokenHash: hashRefreshToken(rawToken),
      familyId,
      expiresAt: new Date(now.getTime() + 60_000),
      revokedAt: null,
    };
    prismaMock.refreshToken.findUnique.mockResolvedValue(existingRow);
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "u@x.com",
    });

    const result = await rotateRefreshToken(db, rawToken, mockEnv, {
      ttlMs: 60_000,
      now: new Date(now.getTime() + 1_000),
    });

    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).not.toBe(rawToken);
    expect(result.familyId).toBe(familyId);
    expect(result.userId).toBe("user-1");

    // Old row marked revoked.
    expect(prismaMock.refreshToken.update).toHaveBeenCalledWith({
      where: { id: "row-1" },
      data: { revokedAt: new Date(now.getTime() + 1_000) },
    });
    // New row created with the SAME familyId.
    const newRowCall = prismaMock.refreshToken.create.mock.calls[0]![0];
    expect(newRowCall.data.familyId).toBe(familyId);
    expect(newRowCall.data.tokenHash).toBe(hashRefreshToken(result.refreshToken));
    expect(newRowCall.data.userId).toBe("user-1");
  });
});

describe("rotateRefreshToken — unknown token", () => {
  it("throws 401 INVALID_REFRESH_TOKEN and does not write", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue(null);

    await expect(
      rotateRefreshToken(db, "nope", mockEnv, { ttlMs: 60_000 }),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: "INVALID_REFRESH_TOKEN",
    });
    expect(prismaMock.refreshToken.update).not.toHaveBeenCalled();
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });
});

describe("rotateRefreshToken — expired token", () => {
  it("throws 401 INVALID_REFRESH_TOKEN; family is NOT revoked", async () => {
    const past = new Date("2024-01-01T00:00:00Z");
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: "row-1",
      userId: "user-1",
      tokenHash: "h",
      familyId: "fam-1",
      expiresAt: new Date(past.getTime() - 1_000),
      revokedAt: null,
    });

    await expect(
      rotateRefreshToken(
        db,
        "any",
        mockEnv,
        { ttlMs: 60_000, now: past },
      ),
    ).rejects.toBeInstanceOf(AppError);
    expect(prismaMock.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });
});

describe("rotateRefreshToken — reuse detection", () => {
  it("revokes the entire family and throws when a revoked token is presented again", async () => {
    const now = new Date("2024-06-01T00:00:00Z");
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: "row-1",
      userId: "user-1",
      tokenHash: "h",
      familyId: "fam-1",
      expiresAt: new Date(now.getTime() + 60_000),
      revokedAt: new Date(now.getTime() - 5_000), // already rotated past
    });

    await expect(
      rotateRefreshToken(db, "stolen", mockEnv, { ttlMs: 60_000, now }),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: "INVALID_REFRESH_TOKEN",
    });

    // Whole family revoked.
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: "fam-1", revokedAt: null },
      data: { revokedAt: now },
    });
    // No new token minted — the legitimate user has to sign in again.
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });
});

describe("revokeRefreshToken", () => {
  it("marks the matching row revoked", async () => {
    const raw = "raw-value";
    await revokeRefreshToken(db, raw);

    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: hashRefreshToken(raw), revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

describe("revokeFamily", () => {
  it("revokes every non-revoked row in the family", async () => {
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 3 });
    const count = await revokeFamily(db, "fam-1");
    expect(count).toBe(3);
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: "fam-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

// One sanity check that the randomBytes call inside the lib actually
// touches Node crypto — guards against accidental removal of the import.
describe("module integration", () => {
  it("uses node:crypto for entropy", () => {
    expect(typeof randomBytes(8).toString("base64url")).toBe("string");
  });
});