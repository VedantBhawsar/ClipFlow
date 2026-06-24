/**
 * Unit tests for the centralized response helpers.
 *
 * The contract under test: every helper emits exactly
 * `{ success: true, message, data }` with the documented status code,
 * and never lets a caller bypass the envelope.
 */
import { describe, it, expect, vi } from "vitest";
import type { Response } from "express";
import { sendOk, sendCreated, sendEmpty } from "./response.js";

/**
 * Build a minimal mock Express response. Each call chains the way the
 * real Express `Response` does: `res.status(N).json(body)` returns `res`.
 * That contract is what makes `sendOk` return the original `res` for
 * further chaining at the call site.
 */
const buildMockResponse = () => {
  let resRef: Response;
  const json = vi.fn().mockImplementation(() => resRef);
  const status = vi.fn().mockImplementation(() => ({ json }));
  const res = { status, json } as unknown as Response;
  resRef = res;
  return { res, json, status };
};

describe("sendOk", () => {
  it("wraps a payload in { success: true, message, data } at 200", () => {
    const { res, status, json } = buildMockResponse();
    sendOk(res, { user: { id: "u1" } }, "Loaded.");

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      success: true,
      message: "Loaded.",
      data: { user: { id: "u1" } },
    });
  });

  it("defaults message to 'OK' when not provided", () => {
    const { res, json } = buildMockResponse();
    sendOk(res, { ok: true });

    expect(json).toHaveBeenCalledWith({
      success: true,
      message: "OK",
      data: { ok: true },
    });
  });

  it("respects a custom status code", () => {
    const { res, status } = buildMockResponse();
    sendOk(res, "payload", "Accepted.", 202);

    expect(status).toHaveBeenCalledWith(202);
  });

  it("passes null through for endpoints with no payload", () => {
    const { res, json } = buildMockResponse();
    sendOk(res, null, "Nothing here.");

    expect(json).toHaveBeenCalledWith({
      success: true,
      message: "Nothing here.",
      data: null,
    });
  });

  it("returns the Express response for chaining", () => {
    const { res } = buildMockResponse();
    const returned = sendOk(res, {});
    expect(returned).toBe(res);
  });
});

describe("sendCreated", () => {
  it("emits a 201 envelope", () => {
    const { res, status, json } = buildMockResponse();
    sendCreated(res, { id: "new-1" }, "Resource created.");

    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith({
      success: true,
      message: "Resource created.",
      data: { id: "new-1" },
    });
  });

  it("defaults the message to 'Created'", () => {
    const { res, json } = buildMockResponse();
    sendCreated(res, { id: "new-1" });

    expect(json).toHaveBeenCalledWith({
      success: true,
      message: "Created",
      data: { id: "new-1" },
    });
  });
});

describe("sendEmpty", () => {
  it("emits a 200 envelope with data: null", () => {
    const { res, status, json } = buildMockResponse();
    sendEmpty(res, "Signed out.");

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      success: true,
      message: "Signed out.",
      data: null,
    });
  });
});