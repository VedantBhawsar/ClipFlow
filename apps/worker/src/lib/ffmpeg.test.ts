/**
 * Unit tests for FFmpeg arg construction and error classification.
 * Pure-string tests — no real FFmpeg binary required.
 */
import { describe, expect, it } from "vitest";
import { buildFfmpegArgs } from "./ffmpeg.js";
import { classifyFfmpegError, type FfmpegErrorClassification } from "./ffmpeg-errors.js";

describe("buildFfmpegArgs", () => {
  const inputPath = "/tmp/input.mp4";
  const outputDir = "/tmp/extract";

  it("assembles the correct audio args", () => {
    const args = buildFfmpegArgs(inputPath, outputDir);
    expect(args).toContain("-i");
    expect(args).toContain(inputPath);
    expect(args).toContain("-acodec");
    expect(args).toContain("libmp3lame");
    expect(args).toContain("-ac");
    expect(args).toContain("1");
    expect(args).toContain("-ar");
    expect(args).toContain("16000");
    expect(args).toContain("-b:a");
    expect(args).toContain("64k");
    expect(args).toContain("-vn");
  });

  it("assembles the correct frame args", () => {
    const args = buildFfmpegArgs(inputPath, outputDir);
    expect(args).toContain("-vf");
    const vfIndex = args.indexOf("-vf");
    const fpsSpec = args[vfIndex + 1];
    expect(fpsSpec).toContain("fps=1/10");
    expect(fpsSpec).toContain("scale=1280:-1");
    expect(args).toContain("-q:v");
    expect(args).toContain("2");
  });

  it("uses audio.mp3 and frame_NNN.jpg as output filenames", () => {
    const args = buildFfmpegArgs(inputPath, outputDir);
    expect(args).toContain(`${outputDir}/audio.mp3`);
    expect(args).toContain(`${outputDir}/frame_%03d.jpg`);
  });

  it("-y flag is present (overwrite without prompting)", () => {
    const args = buildFfmpegArgs(inputPath, outputDir);
    expect(args[0]).toBe("-y");
  });

  it("accepts a custom ffmpegPath", () => {
    const args = buildFfmpegArgs(inputPath, outputDir, {
      ffmpegPath: "/usr/local/bin/ffmpeg",
    });
    expect(args[1]).toBe("/usr/local/bin/ffmpeg");
  });

  it("defaults to 'ffmpeg' when ffmpegPath is omitted", () => {
    const args = buildFfmpegArgs(inputPath, outputDir);
    expect(args[1]).toBe("ffmpeg");
  });
});

describe("classifyFfmpegError", () => {
  const classify = (stderr: string): FfmpegErrorClassification =>
    classifyFfmpegError(new Error(stderr));

  describe("permanent errors", () => {
    it("marks 'no such file or directory' for ffmpeg as FFMPEG_NOT_FOUND", () => {
      const result = classify("ffmpeg: no such file or directory '/usr/bin/ffmpeg'");
      expect(result.kind).toBe("permanent");
      expect(result.reasonCode).toBe("FFMPEG_NOT_FOUND");
    });

    it("marks ENOENT as FFMPEG_NOT_FOUND", () => {
      const result = classifyFfmpegError(
        Object.assign(new Error("ENOENT: no such file or directory"), { code: "ENOENT" }),
      );
      expect(result.kind).toBe("permanent");
      expect(result.reasonCode).toBe("FFMPEG_NOT_FOUND");
    });

    it("marks 'invalid data found' as INVALID_VIDEO", () => {
      const result = classify("Invalid data found at start '%s'");
      expect(result.kind).toBe("permanent");
      expect(result.reasonCode).toBe("INVALID_VIDEO");
    });

    it("marks 'moov atom not found' as INVALID_VIDEO", () => {
      const result = classify("moov atom not found");
      expect(result.kind).toBe("permanent");
      expect(result.reasonCode).toBe("INVALID_VIDEO");
    });

    it("marks 'no mpeg header' as INVALID_VIDEO", () => {
      const result = classify("No MPEG header found");
      expect(result.kind).toBe("permanent");
      expect(result.reasonCode).toBe("INVALID_VIDEO");
    });

    it("marks 'Unsupported format' as INVALID_VIDEO", () => {
      const result = classify("Unsupported format: 'some_format'");
      expect(result.kind).toBe("permanent");
      expect(result.reasonCode).toBe("INVALID_VIDEO");
    });

    it("marks 'codec not supported' as UNSUPPORTED_CODEC", () => {
      const result = classify("Codec 'hevc' not supported");
      expect(result.kind).toBe("permanent");
      expect(result.reasonCode).toBe("UNSUPPORTED_CODEC");
    });

    it("marks 'no decoder found' as UNSUPPORTED_CODEC", () => {
      const result = classify("no decoder for this format");
      expect(result.kind).toBe("permanent");
      expect(result.reasonCode).toBe("UNSUPPORTED_CODEC");
    });

    it("marks 'permission denied' for ffmpeg binary as FFMPEG_NOT_EXECUTABLE", () => {
      const result = classify("Permission denied: '/usr/bin/ffmpeg'");
      expect(result.kind).toBe("permanent");
      expect(result.reasonCode).toBe("FFMPEG_NOT_EXECUTABLE");
    });
  });

  describe("transient errors", () => {
    it("marks generic runtime errors as FFMPEG_RUNTIME_ERROR transient", () => {
      const result = classify("Some runtime error that might succeed on retry");
      expect(result.kind).toBe("transient");
      expect(result.reasonCode).toBe("FFMPEG_RUNTIME_ERROR");
    });

    it("marks non-Error throws as transient", () => {
      const result = classifyFfmpegError("something went wrong");
      expect(result.kind).toBe("transient");
    });

    it("marks null as transient", () => {
      const result = classifyFfmpegError(null);
      expect(result.kind).toBe("transient");
    });
  });
});
