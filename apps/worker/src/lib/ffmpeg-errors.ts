/**
 * Classify FFmpeg errors into permanent vs transient.
 *
 * Permanent errors should not be retried — the input is bad and a second
 * attempt will produce the same failure. Examples: corrupted video file,
 * FFmpeg binary missing from PATH.
 *
 * Transient errors may succeed on retry — disk I/O hiccups, temporary
 * resource exhaustion, etc.
 */

export interface FfmpegErrorClassification {
  /** "permanent" errors should not be retried; "transient" errors may succeed on retry. */
  kind: "permanent" | "transient";
  /** Short machine-readable reason code. */
  reasonCode: string;
  /** Human-readable message suitable for a `failureReason` field. */
  message: string;
}

/**
 * Classify an error thrown by the FFmpeg wrapper.
 *
 * @param err Any error — including non-Error types (defensive).
 */
export const classifyFfmpegError = (
  err: unknown,
): FfmpegErrorClassification => {
  // Handle the FfmpegError class from ffmpeg.ts
  if (err instanceof Error) {
    const msg = err.message ?? "";
    const classified = classifyStderr(msg);
    if (classified) return classified;

    // Fallback for non-stderr Error messages (e.g. from .stderr getter)
    if (err.name === "FfmpegError") {
      const ffmpegErr = err as { stderr?: string; message?: string };
      const text = ffmpegErr.stderr ?? err.message ?? "";
      const fromClass = classifyStderr(text);
      if (fromClass) return fromClass;

      // Unknown FFmpeg error — treat as transient by default
      return {
        kind: "transient",
        reasonCode: "FFMPEG_RUNTIME_ERROR",
        message: text || `FFmpeg exited with an error: ${err.message}`,
      };
    }

    // ENOENT — FFmpeg binary not found (permanent operator config issue)
    if (err.message.includes("ENOENT") || err.message.includes("not found")) {
      return {
        kind: "permanent",
        reasonCode: "FFMPEG_NOT_FOUND",
        message: "FFmpeg binary not found on PATH. Ensure ffmpeg is installed.",
      };
    }

    // EACCES — binary not executable
    if (err.message.includes("EACCES")) {
      return {
        kind: "permanent",
        reasonCode: "FFMPEG_NOT_EXECUTABLE",
        message: "FFmpeg binary found but not executable. Check file permissions.",
      };
    }

    // Anything else from the spawn path — treat as transient
    return {
      kind: "transient",
      reasonCode: "FFMPEG_RUNTIME_ERROR",
      message: err.message,
    };
  }

  // Non-Error throw — treat as unknown/transient
  return {
    kind: "transient",
    reasonCode: "FFMPEG_RUNTIME_ERROR",
    message: String(err ?? "Unknown error during FFmpeg execution"),
  };
};

/**
 * Classify FFmpeg stderr output strings.
 */
const classifyStderr = (stderr: string): FfmpegErrorClassification | null => {
  if (!stderr || typeof stderr !== "string") return null;

  // Binary not found / permission denied
  if (/no such file or directory|permission denied|enoent/i.test(stderr)) {
    if (/ffmpeg|ffprobe/i.test(stderr)) {
      return {
        kind: "permanent",
        reasonCode: "FFMPEG_NOT_FOUND",
        message: "FFmpeg binary not found on PATH. Ensure ffmpeg is installed.",
      };
    }
    // Input file not found is also permanent
    if (/input file.*does not exist|no such file or directory/i.test(stderr)) {
      return {
        kind: "permanent",
        reasonCode: "INPUT_NOT_FOUND",
        message: "Video file does not exist or is not readable.",
      };
    }
  }

  // Corrupt / unrecognised / invalid input
  if (
    /invalid data found|moov atom not found|no mpeg.*header|cannot find.*nal|Unsupported.*format|Format.*not supported/i.test(
      stderr,
    )
  ) {
    return {
      kind: "permanent",
      reasonCode: "INVALID_VIDEO",
      message: "Corrupted or unsupported video file.",
    };
  }

  // Unrecognised codec / missing codec
  if (/codec.*not supported|codec not found|no decoder|unknown codec/i.test(stderr)) {
    return {
      kind: "permanent",
      reasonCode: "UNSUPPORTED_CODEC",
      message: "Video contains an unsupported codec.",
    };
  }

  return null;
};
