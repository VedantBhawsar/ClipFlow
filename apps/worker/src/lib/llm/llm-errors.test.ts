/**
 * Unit tests for `classifyLlmError`.
 *
 * The classifier is a pure switch on the OpenAI SDK error class. We
 * instantiate the SDK's own error classes (the SDK exports them from
 * the `openai` module's top-level surface) and assert the right
 * `{ kind, reasonCode, message }` envelope comes back.
 *
 * Note: the OpenAI SDK's error class constructors all take a final
 * `Headers` parameter (not `undefined`-able in newer SDK versions),
 * so we pass `new Headers()` where the SDK expects it.
 */
import { describe, it, expect } from "vitest";
import OpenAI from "openai";
import { classifyLlmError } from "./llm-errors.js";

/**
 * Empty Headers instance — the OpenAI SDK's error subclasses require
 * a `Headers` argument (not `undefined`) on their constructor. Tests
 * don't care about the headers, only the status + error fields.
 */
const emptyHeaders = (): Headers => new Headers();

describe("classifyLlmError", () => {
  describe("transient errors", () => {
    it("maps APIConnectionTimeoutError → LLM_TIMEOUT", () => {
      const err = new OpenAI.APIConnectionTimeoutError({ message: "timed out" });
      expect(classifyLlmError(err)).toEqual({
        kind: "transient",
        reasonCode: "LLM_TIMEOUT",
        message: "LLM request timed out before reaching the model.",
      });
    });

    it("maps APIConnectionError → LLM_NETWORK", () => {
      const err = new OpenAI.APIConnectionError({ message: "econnrefused" });
      expect(classifyLlmError(err)).toEqual({
        kind: "transient",
        reasonCode: "LLM_NETWORK",
        message: "Network error reaching the LLM endpoint.",
      });
    });

    it("maps RateLimitError → LLM_RATE_LIMIT", () => {
      const err = new OpenAI.RateLimitError(
        429,
        undefined,
        "rate limited",
        emptyHeaders(),
      );
      expect(classifyLlmError(err)).toEqual({
        kind: "transient",
        reasonCode: "LLM_RATE_LIMIT",
        message: "LLM provider rate-limited the request.",
      });
    });

    it("maps InternalServerError → LLM_UPSTREAM", () => {
      const err = new OpenAI.InternalServerError(
        500,
        undefined,
        "upstream boom",
        emptyHeaders(),
      );
      expect(classifyLlmError(err)).toEqual({
        kind: "transient",
        reasonCode: "LLM_UPSTREAM",
        message: "LLM provider returned a 5xx.",
      });
    });

    it("falls back to LLM_UPSTREAM for unknown errors (defensive default)", () => {
      expect(classifyLlmError(new Error("weird thing"))).toEqual({
        kind: "transient",
        reasonCode: "LLM_UPSTREAM",
        message: "weird thing",
      });
    });

    it("uses fallback message when error message is empty", () => {
      expect(classifyLlmError(new Error(""))).toEqual({
        kind: "transient",
        reasonCode: "LLM_UPSTREAM",
        message: "Unknown LLM error.",
      });
    });

    it("handles non-Error throwables (defensive)", () => {
      const out = classifyLlmError("just a string");
      expect(out.kind).toBe("transient");
      expect(out.reasonCode).toBe("LLM_UPSTREAM");
      expect(out.message).toBe("just a string");
    });
  });

  describe("permanent errors", () => {
    it("maps AuthenticationError → LLM_AUTH", () => {
      const err = new OpenAI.AuthenticationError(
        401,
        undefined,
        "bad key",
        emptyHeaders(),
      );
      expect(classifyLlmError(err)).toEqual({
        kind: "permanent",
        reasonCode: "LLM_AUTH",
        message: "LLM provider rejected the API key.",
      });
    });

    it("maps PermissionDeniedError → LLM_SCOPE", () => {
      const err = new OpenAI.PermissionDeniedError(
        403,
        undefined,
        "no scope",
        emptyHeaders(),
      );
      expect(classifyLlmError(err)).toEqual({
        kind: "permanent",
        reasonCode: "LLM_SCOPE",
        message: "LLM provider rejected the request scope.",
      });
    });

    it("maps NotFoundError → LLM_MODEL_NOT_FOUND", () => {
      const err = new OpenAI.NotFoundError(
        404,
        undefined,
        "model not found",
        emptyHeaders(),
      );
      expect(classifyLlmError(err)).toEqual({
        kind: "permanent",
        reasonCode: "LLM_MODEL_NOT_FOUND",
        message:
          "LLM model id is not available on the active provider. Check LLM_MODEL and LLM_PROVIDER.",
      });
    });

    it("maps BadRequestError → LLM_BAD_REQUEST", () => {
      const err = new OpenAI.BadRequestError(
        400,
        undefined,
        "rejected payload",
        emptyHeaders(),
      );
      expect(classifyLlmError(err)).toEqual({
        kind: "permanent",
        reasonCode: "LLM_BAD_REQUEST",
        message: "LLM provider rejected the request payload.",
      });
    });

    it("maps UnprocessableEntityError → LLM_BAD_REQUEST", () => {
      const err = new OpenAI.UnprocessableEntityError(
        422,
        undefined,
        "unprocessable",
        emptyHeaders(),
      );
      expect(classifyLlmError(err).reasonCode).toBe("LLM_BAD_REQUEST");
    });

    it("maps SyntaxError (JSON parse) → LLM_BAD_OUTPUT", () => {
      const err = new SyntaxError("Unexpected token } in JSON at position 12");
      expect(classifyLlmError(err)).toEqual({
        kind: "permanent",
        reasonCode: "LLM_BAD_OUTPUT",
        message: "LLM response was not valid JSON.",
      });
    });
  });

  describe("generic APIError fallback path", () => {
    it("maps 5xx APIError → LLM_UPSTREAM with status in message", () => {
      const err = new OpenAI.APIError(
        503,
        "Service Unavailable",
        undefined,
        emptyHeaders(),
      );
      const out = classifyLlmError(err);
      expect(out.kind).toBe("transient");
      expect(out.reasonCode).toBe("LLM_UPSTREAM");
      expect(out.message).toContain("503");
    });

    it("maps 4xx APIError (no specific subclass) → LLM_BAD_REQUEST", () => {
      const err = new OpenAI.APIError(
        418,
        "I'm a teapot",
        undefined,
        emptyHeaders(),
      );
      const out = classifyLlmError(err);
      expect(out.kind).toBe("permanent");
      expect(out.reasonCode).toBe("LLM_BAD_REQUEST");
      expect(out.message).toContain("418");
    });

    it("uses err.message for APIError with no numeric status", () => {
      // The OpenAI SDK's APIError JSON-stringifies its `error` field
      // into the message when the SDK has no status; we just need to
      // assert the classifier surfaces SOMETHING (transient,
      // LLM_UPSTREAM). Use toContain so the assertion is robust to the
      // SDK's exact serialization (string, object, with/without
      // surrounding quotes).
      const err = new OpenAI.APIError(
        undefined,
        { message: "weird api error" },
        undefined,
        emptyHeaders(),
      );
      const out = classifyLlmError(err);
      expect(out.kind).toBe("transient");
      expect(out.reasonCode).toBe("LLM_UPSTREAM");
      expect(out.message).toContain("weird api error");
    });
  });
});
