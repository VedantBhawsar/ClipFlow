/**
 * Tests for the central error handler's hardened path.
 *
 * The original handler already mapped every error to the central
 * `ApiFailure` envelope; the hardening added `safeSend` so a logging
 * failure or a chained `res.status().json()` throw can't leave the
 * client waiting on a pending connection.
 */
import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { buildErrorHandler } from "./error.js";
import { AppError } from "../errors/AppError.js";
import type { Logger } from "../lib/logger.js";

/**
 * Build a minimal mock Express response object.
 */
const buildMockResponse = (
  opts: { jsonThrows?: boolean } = {},
): {
  res: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  setHeadersSent: (v: boolean) => void;
} => {
  const status = vi.fn(() => mockRes);
  const json = vi.fn(() => {
    if (opts.jsonThrows) throw new Error("boom");
    return mockRes;
  });
  const write = vi.fn();
  const end = vi.fn();
  let headersSent = false;
  const mockRes = {
    status,
    json,
    write,
    end,
    get headersSent(): boolean {
      return headersSent;
    },
    set headersSent(v: boolean) {
      headersSent = v;
    },
    on: vi.fn(),
  } as unknown as Response;
  return {
    res: mockRes,
    status,
    json,
    write,
    end,
    setHeadersSent: (v: boolean) => {
      headersSent = v;
    },
  };
};

/**
 * Cast helper so tests can pass a `req` that only has the fields the
 * error handler actually reads. Going through `unknown` is loud
 * enough that a future widening of the handler signature will
 * surface a TS error here.
 */
const fakeReq = (id: string, method = "POST"): Request =>
  ({ id, path: "/x", method } as unknown as Request);

/**
 * Build a logger mock typed as the real `Logger` so `buildErrorHandler`
 * accepts it without `as any`.
 */
const fakeLogger = (): Logger => {
  const base = {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    silent: vi.fn(),
    child: vi.fn(),
    level: "info" as const,
  };
  return base as unknown as Logger;
};

describe("buildErrorHandler (hardened)", () => {
  it("ZodError → 400 with VALIDATION_ERROR and field issues in details", () => {
    const logger = fakeLogger();
    const handler = buildErrorHandler(logger);
    const { res, status, json } = buildMockResponse();
    const zodErr = new ZodError([
      {
        path: ["email"],
        message: "Required",
        code: "invalid_type",
      } as ZodError["issues"][number],
    ]);
    handler(zodErr, fakeReq("r1"), res, (() => {}) as NextFunction);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "Request input is invalid.",
        error: "VALIDATION_ERROR",
        details: expect.objectContaining({
          issues: expect.any(Array),
        }),
      }),
    );
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("AppError → declared statusCode + code, body includes message", () => {
    const logger = fakeLogger();
    const handler = buildErrorHandler(logger);
    const { res, status, json } = buildMockResponse();
    handler(
      new AppError(409, "EMAIL_TAKEN", "That email is in use."),
      fakeReq("r2"),
      res,
      (() => {}) as NextFunction,
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "That email is in use.",
        error: "EMAIL_TAKEN",
        data: null,
      }),
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  it("unknown error → 500 with INTERNAL_SERVER_ERROR and requestId in details", () => {
    const logger = fakeLogger();
    const handler = buildErrorHandler(logger);
    const { res, status, json } = buildMockResponse();
    handler(
      new Error("kaboom"),
      fakeReq("r3", "GET"),
      res,
      (() => {}) as NextFunction,
    );

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        details: { requestId: "r3" },
      }),
    );
    expect(logger.error).toHaveBeenCalled();
  });

  it("falls back to res.write when res.json throws, so the client still gets a body", () => {
    const logger = fakeLogger();
    const handler = buildErrorHandler(logger);
    const { res, status, json, write, end } = buildMockResponse({ jsonThrows: true });
    handler(
      new AppError(503, "DB_DOWN", "DB is down."),
      fakeReq("r4", "GET"),
      res,
      (() => {}) as NextFunction,
    );

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalled();
    expect(write).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
    const written = write.mock.calls[0]?.[0] as string;
    expect(written).toContain("DB_DOWN");
  });

  it("does not crash when the logger itself throws", () => {
    const base = {
      warn: vi.fn(() => {
        throw new Error("pino is broken");
      }),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      fatal: vi.fn(),
      trace: vi.fn(),
      silent: vi.fn(),
      child: vi.fn(),
      level: "info" as const,
    };
    const logger = base as unknown as Logger;
    const handler = buildErrorHandler(logger);
    const { res, status, json } = buildMockResponse();
    expect(() =>
      handler(
        new AppError(401, "NO", "nope"),
        fakeReq("r5", "GET"),
        res,
        (() => {}) as NextFunction,
      ),
    ).not.toThrow();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalled();
  });
});
