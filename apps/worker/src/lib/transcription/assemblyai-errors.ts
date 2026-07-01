/**
 * Classify AssemblyAI errors into permanent vs transient.
 *
 * Mirrors the pattern in `lib/ffmpeg-errors.ts` so the BullMQ job can apply
 * the same retry / mark-FAILED logic to AssemblyAI failures.
 *
 * Permanent errors should not be retried — the input is bad, the auth is
 * broken, or the account has hit a hard quota. Examples: invalid API key,
 * AssemblyAI quota exhausted, malformed audio, empty transcript.
 *
 * Transient errors may succeed on retry — network blip, AssemblyAI internal
 * 5xx, polling timeout that doesn't reflect a real transcript failure.
 *
 * The `reasonCode` is included verbatim in the `Video.failureReason` so the
 * dashboard can surface a stable, machine-readable tag ("[AAI_QUOTA] …")
 * alongside the human message.
 */

export interface AaiErrorClassification {
  /** "permanent" errors should not be retried; "transient" errors may succeed on retry. */
  kind: "permanent" | "transient";
  /** Short machine-readable reason code. Surfaced in `Video.failureReason`. */
  reasonCode: string;
  /** Human-readable message suitable for a `failureReason` field. */
  message: string;
}

/**
 * Classify an error thrown by the AssemblyAI wrapper. Accepts `unknown`
 * because the underlying SDK throws a mix of plain `Error` and the
 * `TranscriptService` error variants.
 */
export const classifyAaiError = (err: unknown): AaiErrorClassification => {
  if (err instanceof Error) {
    const msg = err.message ?? "";

    // Auth — bad / missing API key. Permanent operator config issue.
    if (/401|unauthor|invalid api key|api_key/i.test(msg)) {
      return {
        kind: "permanent",
        reasonCode: "AAI_AUTH",
        message: "AssemblyAI authentication failed. Check ASSEMBLYAI_API_KEY.",
      };
    }

    // Quota — the account has been rate-limited or hit its monthly cap.
    // Permanent for the current upload (retries will keep failing) but
    // recoverable for the user once they upgrade. Permanent here is
    // correct from the BullMQ job's perspective.
    if (/429|rate.?limit|quota/i.test(msg)) {
      return {
        kind: "permanent",
        reasonCode: "AAI_QUOTA",
        message:
          "AssemblyAI quota or rate limit reached. Retry after upgrading or waiting.",
      };
    }

    // 4xx that isn't auth or quota — usually a malformed request body
    // (e.g. wrong content-type on the audio upload). Permanent.
    if (/^4\d\d\b|HTTP\/1\.1 4\d\d/.test(msg)) {
      return {
        kind: "permanent",
        reasonCode: "AAI_BAD_REQUEST",
        message: `AssemblyAI rejected the request: ${msg}`,
      };
    }

    // 5xx — server-side. Transient.
    if (/^5\d\d\b|HTTP\/1\.1 5\d\d|internal server|service unavailable/i.test(msg)) {
      return {
        kind: "transient",
        reasonCode: "AAI_UPSTREAM",
        message: `AssemblyAI upstream error: ${msg}`,
      };
    }

    // AssemblyAI reported the transcript itself as errored (audio was
    // empty, unrecognised, or contained no speech). The wrapped error
    // message will start with "[AAI_TRANSCRIPT_ERROR]" — set by
    // assemblyai.ts when it sees `transcript.status === "error"`.
    if (msg.startsWith("[AAI_TRANSCRIPT_ERROR]")) {
      const detail = msg.replace("[AAI_TRANSCRIPT_ERROR]", "").trim();
      return {
        kind: "permanent",
        reasonCode: "AAI_TRANSCRIPT_ERROR",
        message: detail || "AssemblyAI failed to transcribe the audio.",
      };
    }

    // Polling timed out before the transcript completed. Not a transcript
    // failure per se — could be a slow video on a contended queue. Transient.
    if (/polling.*timeout|waitUntilReady.*timed out/i.test(msg)) {
      return {
        kind: "transient",
        reasonCode: "AAI_POLL_TIMEOUT",
        message: `AssemblyAI polling exceeded the configured timeout: ${msg}`,
      };
    }

    // ENOENT / spawn-class failures — temp file missing. Treat as
    // transient since they point to our own disk state, not AssemblyAI.
    if (/ENOENT|no such file|spawn/i.test(msg)) {
      return {
        kind: "transient",
        reasonCode: "AAI_LOCAL_IO",
        message: `Local I/O error during transcription: ${msg}`,
      };
    }

    // Unknown — treat as transient by default. Better to retry than to
    // permanently fail a job we don't understand.
    return {
      kind: "transient",
      reasonCode: "AAI_RUNTIME_ERROR",
      message: msg,
    };
  }

  // Non-Error throw — unknown / transient.
  return {
    kind: "transient",
    reasonCode: "AAI_RUNTIME_ERROR",
    message: String(err ?? "Unknown error during transcription"),
  };
};