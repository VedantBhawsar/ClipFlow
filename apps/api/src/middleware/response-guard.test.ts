/**
 * Tests for the `responseGuard` middleware.
 *
 * The middleware's job is to listen on `res.on('close', ...)` and,
 * when the connection drops with no response having been written,
 * emit a 500 `REQUEST_ABORTED` envelope. We exercise that contract
 * directly with an EventEmitter mock so the test is deterministic
 * and doesn't depend on real socket timing.
 */
import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { Response, Request, NextFunction } from "express";
import type { ApiFailure } from "@clipflow/types";
import { responseGuard } from "./response-guard.js";

/**
 * Build a minimal Express-shaped response backed by an
 * EventEmitter so we can fire `finish` and `close` synchronously.
 *
 * `status()`, `json()`, `write()`, `end()` are all spied so the
 * tests can assert which one the middleware called.
 */
const buildMockResponse = (init: { headersSent?: boolean } = {}): {
  res: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  emitter: EventEmitter;
  setHeadersSent: (v: boolean) => void;
} => {
  const emitter = new EventEmitter();
  let headersSent = init.headersSent ?? false;

  const status = vi.fn(() => mockRes);
  const json = vi.fn(() => mockRes);
  const write = vi.fn();
  const end = vi.fn();

  const handlers = emitter as unknown as Pick<Response, "on" | "emit" | "once"> & EventEmitter;
  const mockRes = {
    status,
    json,
    write,
    end,
    on: handlers.on.bind(handlers),
    once: handlers.once.bind(handlers),
    emit: handlers.emit.bind(handlers),
    get headersSent() {
      return headersSent;
    },
  } as unknown as Response;

  return {
    res: mockRes,
    status,
    json,
    write,
    end,
    emitter: handlers,
    setHeadersSent: (v: boolean) => {
      headersSent = v;
    },
  };
};

describe("responseGuard", () => {
  it("emits a 500 REQUEST_ABORTED envelope on the close event when nothing was sent", () => {
    const next = vi.fn() as unknown as NextFunction;
    const req = {} as Request;
    const { res, status, json, emitter } = buildMockResponse();

    responseGuard(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);

    // Simulate the connection closing with no response having been
    // written — this is the exact event the middleware listens for.
    emitter.emit("close");

    expect(status).toHaveBeenCalledWith(500);
    const body = (json.mock.calls[0]?.[0] ?? null) as ApiFailure | null;
    expect(body).toEqual({
      success: false,
      message: expect.any(String) as unknown as string,
      data: null,
      error: "REQUEST_ABORTED",
    });
  });

  it("is a no-op when the close event fires after a response was already sent", () => {
    const next = vi.fn() as unknown as NextFunction;
    const req = {} as Request;
    const { res, status, json, emitter, setHeadersSent } = buildMockResponse();
    setHeadersSent(true);

    responseGuard(req, res, next);
    emitter.emit("close");

    expect(status).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });

  it("does not throw when the response stream can no longer accept bytes", () => {
    const next = vi.fn() as unknown as NextFunction;
    const req = {} as Request;
    const { res, emitter, json } = buildMockResponse();
    // Simulate a closed socket: res.status().json() throws.
    json.mockImplementation(() => {
      throw new Error("socket closed");
    });

    responseGuard(req, res, next);
    expect(() => emitter.emit("close")).not.toThrow();
  });
});
