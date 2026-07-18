/**
 * Translate raw upstream error strings (Replicate / Gemini / AssemblyAI /
 * FFmpeg / YouTube) into user-friendly copy. The full technical string
 * stays in the DB for support / Sentry; what the user sees is the
 * friendly version.
 *
 * Why a separate module instead of inlining into VideoCard:
 *  - The same raw string can land on the dashboard list AND the detail
 *    page (see `apps/web/app/dashboard/published/[id]/page.tsx`). One
 *    source of truth keeps them in lockstep.
 *  - The mapping is the kind of thing we want unit-testable in
 *    isolation.
 *  - The dashboard is the only place this is consumed today, so it
 *    lives next to the dashboard's other lib code (`lib/video-status.ts`)
 *    rather than climbing all the way to `@clipflow/types`.
 *
 * Pattern is order-dependent: the first matching rule wins. Add
 * vendor-specific cases BELOW the generic ones so a more specific
 * pattern always takes priority.
 *
 * The structure `Video.failureReason` looks like
 *   `[REASON_CODE] human message`
 * for the worker-classified errors (FFmpeg, AssemblyAI, ImageGen). The
 * "REASON_CODE" is the bucket; the "human message" is the upstream's
 * own string and is what we want to swap out.
 */

/**
 * Which pipeline step a failure happened in. Extracted from the error
 * code prefix so the error UI can show step-specific copy.
 */
export type FailedStep = "extraction" | "transcription" | "generation" | "thumbnails" | "publish" | "unknown";

export const extractFailedStep = (raw: string | null | undefined): FailedStep => {
  if (!raw) return "unknown";
  const code = raw.match(/^\[([A-Z_]+)\]/)?.[1] ?? "";
  const prefix = code.split("_")[0] ?? "";
  switch (prefix) {
    case "FFMPEG": return "extraction";
    case "AAI": return "transcription";
    case "LLM":
    case "GEN": return "generation";
    case "THUMBNAIL":
    case "NO_CHAPTERS":
    case "IMG":
    case "REPLICATE":
    case "GEMINI": return "thumbnails";
    case "QUOTA":
    case "YOUTUBE": return "publish";
    default: return "unknown";
  }
};

const STEP_LABEL: Record<FailedStep, string> = {
  extraction: "audio and frame extraction",
  transcription: "transcription",
  generation: "chapter generation",
  thumbnails: "thumbnail generation",
  publish: "publishing to YouTube",
  unknown: "processing",
};

const FRIENDLY_RULES: ReadonlyArray<{
  match: RegExp;
  message: string;
  hint?: string;
}> = [
  // ---- Image gen (Replicate) ----
  {
    match: /replicate error.*402|predictions failed with status 402.*payment|insufficient credit/i,
    message: "Our image generation service is out of credits.",
    hint: "We've been notified — your video will retry automatically once credits are topped up. You can also try again now.",
  },
  {
    match: /replicate error/i,
    message: "We couldn't generate a thumbnail from this video.",
    hint: "Try again — most failures are temporary.",
  },

  // ---- Image gen (Gemini) ----
  {
    match: /gemini rate limit|429.*quota|you exceeded your current quota/i,
    message: "Image generation is temporarily rate-limited.",
    hint: "Wait a few minutes, then try again.",
  },
  {
    match: /gemini error.*401|invalid authentication credentials|oauth.*token/i,
    message: "We hit an authentication error generating a thumbnail.",
    hint: "Try again — the worker will refresh the access token on the next attempt.",
  },
  {
    match: /gemini error|gemini.*internal/i,
    message: "Our image generation service hit an error.",
    hint: "Try again — most failures are temporary.",
  },

  // ---- Transcription (AssemblyAI) ----
  {
    match: /aai.*audio.*missing|no audio.*found|s3keyaudio.*null/i,
    message: "We couldn't extract audio from this video.",
    hint: "The file may be in a format we don't support. Try re-uploading as MP4.",
  },
  {
    match: /\[AAI_AUTH\]|aai.*auth/i,
    message: "Transcription is not configured on the server.",
    hint: "This is on us. Try again — if it keeps failing, contact support.",
  },
  {
    match: /\[AAI_QUOTA\]|assemblyai.*quota|aai.*quota/i,
    message: "Transcription service quota is exhausted.",
    hint: "We're aware of this. Try again later — your video will retry automatically.",
  },
  {
    match: /assemblyai.*rate limit|429/i,
    message: "Transcription is temporarily rate-limited.",
    hint: "Try again in a few minutes.",
  },
  {
    match: /\[AAI_BAD_REQUEST\]|aai.*bad.*request/i,
    message: "The audio file couldn't be submitted for transcription.",
    hint: "The format may be unsupported. Try re-uploading the video.",
  },
  {
    match: /\[AAI_TRANSCRIPT_ERROR\]/i,
    message: "Transcription failed to complete.",
    hint: "Try again — most transcription failures are temporary.",
  },
  {
    match: /assemblyai|transcription.*failed/i,
    message: "We couldn't transcribe the audio in this video.",
    hint: "Try again — most failures are temporary.",
  },

  // ---- LLM / chapter generation ----
  {
    match: /\[LLM_AUTH\]|llm.*auth/i,
    message: "The AI service for chapter generation isn't configured.",
    hint: "This is on us. Try again — if it keeps failing, contact support.",
  },
  {
    match: /\[LLM_RATE_LIMIT\]|llm.*rate limit/i,
    message: "Chapter generation is temporarily rate-limited.",
    hint: "Try again in a few minutes.",
  },
  {
    match: /\[LLM_BAD_OUTPUT\]/i,
    message: "The AI returned an unexpected response while generating chapters.",
    hint: "Try again — most failures are temporary.",
  },
  {
    match: /\[GEN_TRANSCRIPT_MISSING\]/i,
    message: "The transcript wasn't ready when chapter generation started.",
    hint: "Try again — this usually resolves on retry.",
  },
  {
    match: /\[GEN_TRANSCRIPT_PARSE_ERROR\]/i,
    message: "We couldn't read the transcript for chapter generation.",
    hint: "Try again — most failures are temporary.",
  },
  {
    match: /llm|chapter.*generat/i,
    message: "We couldn't generate chapters from the transcript.",
    hint: "Try again — most failures are temporary.",
  },

  // ---- Thumbnail / image gen ----
  {
    match: /\[THUMBNAIL_PREREQ_MISSING\]/i,
    message: "Thumbnail prerequisites (chapters or frames) are missing.",
    hint: "Try again — the pipeline may still be catching up.",
  },
  {
    match: /\[NO_CHAPTERS\]/i,
    message: "No chapters were found to base thumbnails on.",
    hint: "Try again after chapters are generated.",
  },
  {
    match: /thumbnail.*error|thumbnails.*fail/i,
    message: "We couldn't generate thumbnails for this video.",
    hint: "Try again — most failures are temporary.",
  },

  // ---- FFmpeg / extract ----
  {
    match: /ffmpeg_runtime_error|corrupt.*input|invalid.*data/i,
    message: "We couldn't read this video file.",
    hint: "Try re-uploading the file — it may have been corrupted during upload.",
  },
  {
    match: /ffmpeg.*not found|ffmpeg.*missing|ffmpeg_binary_missing/i,
    message: "Our processing tool isn't installed on the server.",
    hint: "This is on us. Try again — and if it keeps failing, contact support.",
  },

  // ---- Publish (YouTube) ----
  {
    match: /quota.*exceeded|quotaexceeded/i,
    message: "YouTube's daily API quota is exhausted.",
    hint: "Quotas reset at midnight Pacific time. Your video will publish automatically once the quota is back.",
  },
  {
    match: /channel.*needs.*reauth|needs.*reconnect|reauth/i,
    message: "Your YouTube channel needs to be reconnected.",
    hint: "Go to Settings → Connected accounts to reconnect YouTube.",
  },
  {
    match: /invalid.*metadata|invalid.*video.*metadata/i,
    message: "YouTube rejected the video metadata.",
    hint: "Check the title, description, and tags in the review screen, then try publishing again.",
  },
  {
    match: /forbidden|403/i,
    message: "YouTube refused the upload.",
    hint: "Check that your channel is in good standing on YouTube, then try again.",
  },
  {
    match: /youtube.*temporarily.*unavailable|youtube.*5\d\d/i,
    message: "YouTube is temporarily unavailable.",
    hint: "Try again in a few minutes.",
  },

  // ---- Generic catches (last resort) ----
  {
    match: /network|timeout|etimedout|econnreset/i,
    message: "We hit a network error processing this video.",
    hint: "Try again — most failures are temporary.",
  },
];

/**
 * User-facing message for a raw `Video.failureReason`. Returns the
 * `generic` fallback when no rule matches so the UI always has
 * something to render.
 *
 * The function never throws and never returns `null` — every branch
 * returns a `FriendlyError` shape.
 */
export interface FriendlyError {
  /** The primary user-facing line. Always present. */
  message: string;
  /** Optional secondary line (e.g. actionable next step). */
  hint: string | null;
  /** Which pipeline step failed. */
  step: FailedStep;
  /** Human label for the failed step (e.g. "thumbnail generation"). */
  stepLabel: string;
  /**
   * The matched `failureReason` — useful when the UI wants to render
   * a "View technical details" disclosure (collapsed by default).
   * `null` for the generic fallback so the UI knows there was no
   * upstream string.
   */
  raw: string | null;
}

const GENERIC_MESSAGE = "We couldn't process this video.";
const GENERIC_HINT =
  "Try again — most failures are temporary. If it keeps failing, contact support.";

export function friendlyError(raw: string | null | undefined): FriendlyError {
  if (!raw) {
    return { message: GENERIC_MESSAGE, hint: GENERIC_HINT, step: "unknown", stepLabel: STEP_LABEL.unknown, raw: null };
  }

  const step = extractFailedStep(raw);

  for (const rule of FRIENDLY_RULES) {
    if (rule.match.test(raw)) {
      return { message: rule.message, hint: rule.hint ?? null, step, stepLabel: STEP_LABEL[step], raw };
    }
  }

  return { message: GENERIC_MESSAGE, hint: GENERIC_HINT, step, stepLabel: STEP_LABEL[step], raw };
}
