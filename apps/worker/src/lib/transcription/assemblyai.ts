/**
 * Thin AssemblyAI wrapper for the `transcription` BullMQ job.
 *
 * Three public exports:
 *  - `transcribeAudioFile` — submits an audio file path, polls for
 *    completion, returns a normalised `AaiTranscript` shape (or throws).
 *  - `buildAaiClient` — builds a typed `AssemblyAI` client from an API
 *    key. Provided as a separate export so tests can inject a mock without
 *    going through the SDK.
 *  - `normaliseAaiTranscript` — maps the SDK's `Transcript` shape onto our
 *    internal `AaiTranscript`. Pure, exported for unit tests + future
 *    reuse (e.g. webhook handler that gets a transcript ID from elsewhere).
 *
 * Why a wrapper:
 *  - The `transcription` job needs three things from AssemblyAI:
 *      1. word-level timestamps (so the LLM can pick exact highlight frames)
 *      2. auto_chapters (so the LLM has topic boundaries to anchor on)
 *      3. language detection (so the dashboard can show the right lang hint)
 *    The wrapper bakes those three flags in so call sites can't forget.
 *  - The SDK returns timestamps in **seconds** (number, float). Our internal
 *    types use **milliseconds** (Int). The wrapper normalises to ms at the
 *    boundary so downstream code never has to think about it.
 *  - Errors come out as plain `Error` objects; the sibling `assemblyai-errors.ts`
 *    classifies them into permanent vs transient for the job layer.
 *
 * NOT a wrapper:
 *  - We deliberately do not wrap `submit` + `get` in a polling abstraction —
 *    the SDK already provides `transcribe` which does submit + poll + return.
 *    Re-implementing that would just be a bug surface.
 */
import { AssemblyAI } from "assemblyai";
import type { Transcript } from "assemblyai";
import { readFile } from "node:fs/promises";
import type { Env } from "@clipflow/config";

/**
 * Public normalised transcript shape. Downstream code consumes this,
 * never the raw SDK `Transcript` — keeps a single translation layer.
 */
export interface AaiTranscript {
  /** AssemblyAI's transcript ID. Useful for support tickets; not persisted. */
  id: string;
  /** Always "completed" when this object is returned. */
  status: "completed";
  /** Full transcript text. Whitespace-collapsed by AssemblyAI. */
  text: string;
  /** Word-level timings, in MILLISECONDS (not seconds — see file header). */
  words: AaiWord[];
  /** Auto-chapter boundaries from AssemblyAI's `auto_chapters` flag. */
  chapters: AaiChapter[];
  /** ISO 639-1 code from `language_detection` (e.g. "en", "es"). */
  languageCode: string;
  /** Audio duration in milliseconds. */
  durationMs: number;
}

export interface AaiWord {
  text: string;
  startMs: number;
  endMs: number;
  /** AssemblyAI's per-word confidence score, 0..1. */
  confidence: number;
}

export interface AaiChapter {
  startMs: number;
  endMs: number;
  /** Short gist, ~3-8 words. Useful as a chapter title fallback. */
  gist: string;
  /** One-sentence headline. AssemblyAI may return an empty string. */
  headline: string;
  /** Multi-sentence summary. AssemblyAI may return an empty string. */
  summary: string;
}

export interface TranscribeOptions {
  /** Override the poll interval (ms). Falls back to env.TRANSCRIBE_POLL_MS. */
  pollingIntervalMs?: number;
  /** Override the poll timeout (ms). Falls back to env.TRANSCRIBE_TIMEOUT_MS. */
  pollingTimeoutMs?: number;
}

/**
 * Build a typed AssemblyAI client. Pure factory — no I/O, easy to mock.
 * Throws if `apiKey` is missing; the worker `transcription` job is
 * responsible for surfacing that as a permanent failure.
 */
export const buildAaiClient = (apiKey: string): AssemblyAI => {
  if (!apiKey) {
    throw new Error("[AAI_AUTH] ASSEMBLYAI_API_KEY is not configured.");
  }
  return new AssemblyAI({ apiKey });
};

/**
 * Submit an audio file to AssemblyAI and wait for the transcript.
 *
 * @param env       Worker env (pulls `TRANSCRIBE_POLL_MS` / `TRANSCRIBE_TIMEOUT_MS`).
 * @param apiKey    AssemblyAI API key. Worker passes `env.ASSEMBLYAI_API_KEY`.
 * @param audioPath Absolute path to a local audio file (mp3 / wav / m4a …).
 *                  The SDK uploads it as multipart under the hood.
 * @param opts      Optional polling overrides (used by tests).
 */
export const transcribeAudioFile = async (
  env: Env,
  apiKey: string,
  audioPath: string,
  opts: TranscribeOptions = {},
): Promise<AaiTranscript> => {
  const client = buildAaiClient(apiKey);

  // Eagerly read the file so ENOENT becomes a typed error up-front.
  // The SDK accepts a path string too, but reading here gives us a
  // single point to surface "audio missing" as a permanent failure
  // instead of a generic SDK upload error.
  const audioBuffer = await readFile(audioPath);

  const pollingInterval = opts.pollingIntervalMs ?? env.TRANSCRIBE_POLL_MS;
  const pollingTimeout = opts.pollingTimeoutMs ?? env.TRANSCRIBE_TIMEOUT_MS;

  const transcript = await client.transcripts.transcribe(
    {
      audio: audioBuffer,
      // The three flags our pipeline relies on. Hard-coding them here
      // means callers can't accidentally toggle them off.
      language_detection: true,
      auto_chapters: true,
      // v1: off. Multi-host podcasts degrade gracefully without it.
      // Toggle in v1.5 via a UserPreferences column.
      speaker_labels: false,
    },
    {
      pollingInterval,
      pollingTimeout,
    },
  );

  // The SDK throws on 4xx / 5xx; a `status === "error"` here means
  // AssemblyAI accepted the upload but couldn't transcribe it
  // (e.g. silent audio, unsupported codec).
  if (transcript.status === "error") {
    throw new Error(
      `[AAI_TRANSCRIPT_ERROR] ${transcript.error ?? "Unknown AssemblyAI transcript error"}`,
    );
  }

  if (transcript.status !== "completed") {
    // Defensive — should be unreachable because `transcribe` polls until
    // terminal. If the timeout fired, `transcripts.transcribe` throws
    // rather than returning, so this branch is "should never happen."
    throw new Error(
      `[AAI_TRANSCRIPT_ERROR] Transcript returned in unexpected status: ${transcript.status}`,
    );
  }

  return normaliseAaiTranscript(transcript);
};

/**
 * Map the SDK's `Transcript` shape onto our internal `AaiTranscript`.
 * Pure — no I/O, easy to unit-test in isolation.
 *
 * Exported so:
 *  1. The unit tests can verify the SDK-shape → internal-shape mapping.
 *  2. A future webhook handler that gets a transcript ID from AssemblyAI's
 *     callback can call `get(id)` then re-use this mapper, instead of
 *     duplicating the field translations.
 */
export const normaliseAaiTranscript = (transcript: Transcript): AaiTranscript => {
  // Language: SDK returns a regional code like "en_us" / "es_es" / "hi_in"
  // in `language_code`. We persist the slice up to the first underscore
  // so the row carries an ISO 639-1 ("en", "es", "hi") for dashboards
  // that group by language. Default "en" if AssemblyAI couldn't detect
  // (very short / silent audio).
  const rawLang = transcript.language_code ?? "en";
  const languageCode = rawLang.split("_")[0] ?? "en";

  // Duration: SDK exposes `audio_duration` as the only duration field
  // (seconds, float). Round to milliseconds — AssemblyAI returns e.g.
  // 1532.84. Integer ms avoids floating-point drift when we later
  // align against FFmpeg's seek times.
  const durationSeconds = transcript.audio_duration ?? 0;

  return {
    id: transcript.id,
    status: "completed",
    text: transcript.text ?? "",
    words: (transcript.words ?? []).map((w) => ({
      text: w.text,
      startMs: Math.round(w.start * 1000),
      endMs: Math.round(w.end * 1000),
      confidence: w.confidence,
    })),
    chapters: (transcript.chapters ?? []).map((c) => ({
      startMs: Math.round(c.start * 1000),
      endMs: Math.round(c.end * 1000),
      gist: c.gist ?? "",
      headline: c.headline ?? "",
      summary: c.summary ?? "",
    })),
    languageCode,
    durationMs: Math.round(durationSeconds * 1000),
  };
};