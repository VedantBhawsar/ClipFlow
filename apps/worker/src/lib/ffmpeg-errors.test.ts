/**
 * Unit tests for FFmpeg error classification.
 * Pure-string tests — no real FFmpeg binary required.
 */
import { describe, expect, it } from "vitest";
import { classifyFfmpegError, type FfmpegErrorClassification } from "./ffmpeg-errors.js";

describe("classifyFfmpegError", () => {
  const classify = (stderr: string): FfmpegErrorClassification =>
    classifyFfmpegError(new Error(stderr));

  // ---- Permanent: FFmpeg binary not found ----
  describe("FFMPEG_NOT_FOUND", () => {
    it('"no such file or directory" for ffmpeg', () => {
      expect(classify("ffmpeg: no such file or directory '/usr/bin/ffmpeg'").reasonCode).toBe(
        "FFMPEG_NOT_FOUND",
      );
    });

    it("ENOENT from spawn", () => {
      const err = Object.assign(new Error("ENOENT: no such file or directory"), {
        code: "ENOENT",
      });
      expect(classifyFfmpegError(err).reasonCode).toBe("FFMPEG_NOT_FOUND");
    });

    it('"not found" in message', () => {
      expect(classify("Command failed: ffmpeg not found").reasonCode).toBe("FFMPEG_NOT_FOUND");
    });
  });

  // ---- Permanent: Binary not executable ----
  describe("FFMPEG_NOT_EXECUTABLE", () => {
    it('"permission denied" for binary path', () => {
      expect(classify("Permission denied: '/usr/bin/ffmpeg'").reasonCode).toBe(
        "FFMPEG_NOT_EXECUTABLE",
      );
    });
  });

  // ---- Permanent: Corrupt / unrecognised input ----
  describe("INVALID_VIDEO", () => {
    it('"invalid data found"', () => {
      expect(classify("Invalid data found at start '%s'").reasonCode).toBe("INVALID_VIDEO");
    });

    it('"moov atom not found"', () => {
      expect(classify("moov atom not found").reasonCode).toBe("INVALID_VIDEO");
    });

    it('"no mpeg header found"', () => {
      expect(classify("No MPEG header found").reasonCode).toBe("INVALID_VIDEO");
    });

    it('"cannot find NAL"', () => {
      expect(classify("cannot find a NAL unit").reasonCode).toBe("INVALID_VIDEO");
    });

    it('"Unsupported format"', () => {
      expect(classify("Unsupported format: 'avi'").reasonCode).toBe("INVALID_VIDEO");
    });
  });

  // ---- Permanent: Unsupported codec ----
  describe("UNSUPPORTED_CODEC", () => {
    it('"codec not supported"', () => {
      expect(classify("Codec 'hevc' not supported").reasonCode).toBe("UNSUPPORTED_CODEC");
    });

    it('"no decoder for this format"', () => {
      expect(classify("no decoder for this format").reasonCode).toBe("UNSUPPORTED_CODEC");
    });

    it('"unknown codec"', () => {
      expect(classify("Unknown codec: 'ap4x'").reasonCode).toBe("UNSUPPORTED_CODEC");
    });
  });

  // ---- Transient: runtime / retryable ----
  describe("FFMPEG_RUNTIME_ERROR (transient)", () => {
    it("generic stderr maps to transient", () => {
      expect(classify("Some runtime I/O error that might succeed on retry").kind).toBe(
        "transient",
      );
    });

    it("non-Error thrown value maps to transient", () => {
      expect(classifyFfmpegError("just a string").kind).toBe("transient");
      expect(classifyFfmpegError(null).kind).toBe("transient");
      expect(classifyFfmpegError(undefined).kind).toBe("transient");
    });
  });

  // ---- Null / undefined safe ----
  describe("null / undefined input", () => {
    it("null → transient with generic message", () => {
      const r = classifyFfmpegError(null);
      expect(r.kind).toBe("transient");
    });

    it("undefined → transient", () => {
      const r = classifyFfmpegError(undefined);
      expect(r.kind).toBe("transient");
    });
  });
});
