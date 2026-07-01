/**
 * Unit tests for AssemblyAI error classification.
 *
 * Pure input/output tests — no AssemblyAI client required.
 */
import { describe, expect, it } from "vitest";
import { classifyAaiError } from "./assemblyai-errors.js";

describe("classifyAaiError", () => {
  describe("permanent failures", () => {
    it("classifies 401 as AAI_AUTH (permanent)", () => {
      const result = classifyAaiError(new Error("401 Unauthorized: invalid API key"));
      expect(result.kind).toBe("permanent");
      expect(result.reasonCode).toBe("AAI_AUTH");
    });

    it("classifies 429 / quota / rate limit as AAI_QUOTA (permanent)", () => {
      const cases = [
        new Error("429 Too Many Requests"),
        new Error("Quota exceeded for the month"),
        new Error("rate limit hit, slow down"),
      ];
      for (const err of cases) {
        const result = classifyAaiError(err);
        expect(result.kind).toBe("permanent");
        expect(result.reasonCode).toBe("AAI_QUOTA");
      }
    });

    it("classifies other 4xx as AAI_BAD_REQUEST (permanent)", () => {
      const result = classifyAaiError(new Error("400 Bad Request: malformed body"));
      expect(result.kind).toBe("permanent");
      expect(result.reasonCode).toBe("AAI_BAD_REQUEST");
    });

    it("classifies [AAI_TRANSCRIPT_ERROR] tagged errors as AAI_TRANSCRIPT_ERROR (permanent)", () => {
      const result = classifyAaiError(
        new Error("[AAI_TRANSCRIPT_ERROR] Audio had no speech"),
      );
      expect(result.kind).toBe("permanent");
      expect(result.reasonCode).toBe("AAI_TRANSCRIPT_ERROR");
      expect(result.message).toContain("Audio had no speech");
    });

    it("classifies [AAI_TRANSCRIPT_ERROR] with empty body as a sensible default message", () => {
      const result = classifyAaiError(new Error("[AAI_TRANSCRIPT_ERROR]"));
      expect(result.kind).toBe("permanent");
      expect(result.reasonCode).toBe("AAI_TRANSCRIPT_ERROR");
      expect(result.message).toMatch(/AssemblyAI failed/i);
    });
  });

  describe("transient failures", () => {
    it("classifies 5xx as AAI_UPSTREAM (transient)", () => {
      const cases = [
        new Error("500 Internal Server Error"),
        new Error("HTTP/1.1 502 Bad Gateway"),
        new Error("service unavailable"),
      ];
      for (const err of cases) {
        const result = classifyAaiError(err);
        expect(result.kind).toBe("transient");
        expect(result.reasonCode).toBe("AAI_UPSTREAM");
      }
    });

    it("classifies polling timeout as AAI_POLL_TIMEOUT (transient)", () => {
      const result = classifyAaiError(
        new Error("waitUntilReady timed out after 900000ms"),
      );
      expect(result.kind).toBe("transient");
      expect(result.reasonCode).toBe("AAI_POLL_TIMEOUT");
    });

    it("classifies ENOENT / spawn failures as AAI_LOCAL_IO (transient)", () => {
      const cases = [
        new Error("ENOENT: no such file or directory"),
        new Error("spawn ENOENT ffmpeg"),
      ];
      for (const err of cases) {
        const result = classifyAaiError(err);
        expect(result.kind).toBe("transient");
        expect(result.reasonCode).toBe("AAI_LOCAL_IO");
      }
    });

    it("classifies unknown errors as AAI_RUNTIME_ERROR (transient by default)", () => {
      const result = classifyAaiError(new Error("Some weird socket glitch"));
      expect(result.kind).toBe("transient");
      expect(result.reasonCode).toBe("AAI_RUNTIME_ERROR");
    });
  });

  describe("non-Error throws", () => {
    it("classifies thrown string as AAI_RUNTIME_ERROR (transient)", () => {
      const result = classifyAaiError("something broke");
      expect(result.kind).toBe("transient");
      expect(result.reasonCode).toBe("AAI_RUNTIME_ERROR");
    });

    it("classifies thrown null/undefined as AAI_RUNTIME_ERROR (transient)", () => {
      const r1 = classifyAaiError(null);
      const r2 = classifyAaiError(undefined);
      expect(r1.kind).toBe("transient");
      expect(r2.kind).toBe("transient");
    });
  });
});