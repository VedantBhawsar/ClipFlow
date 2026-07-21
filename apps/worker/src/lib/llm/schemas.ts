/**
 * Zod schemas for the `generate` job's LLM output.
 *
 * The LLM is asked to emit a strict JSON object — `{ summary, chapters[] }`
 * — but even with `response_format: { type: "json_object" }` it can
 * still produce JSON that doesn't match our shape. We validate the
 * raw text in two stages:
 *
 *   1. `LlmOutputSchema.safeParse(json)` — checks the structural
 *      shape and applies the YouTube hard floors (first=0, min 3,
 *      max 12, min 10 s gap). The static schema enforces what
 *      YouTube itself enforces — it's the absolute floor.
 *
 *   2. `parseLlmOutput(text, durationMs)` — adds the last-chapter-
 *      within-duration check on top. The dynamic part is just the
 *      duration check; the per-video GAP is NOT enforced server-side.
 *      The prompt is content-aware (AssemblyAI auto-chapters are the
 *      primary anchor), so we trust the LLM to place boundaries at
 *      real topic shifts rather than at a uniform interval. If the
 *      LLM produces micro-chapters the prompt will catch it on the
 *      retry — but the schema doesn't reject a 30 s gap between
 *      genuine topic shifts on a 30-minute video.
 *
 * On failure, the caller can retry the LLM call with an appended
 * instruction pointing at the specific complaint.
 */
import { z } from "zod";

/** Single chapter shape produced by the LLM. */
const chapterSchema = z.object({
  startMs: z
    .number()
    .int()
    .min(0, "Chapter startMs must be non-negative"),
  title: z
    .string()
    .min(1, "Chapter title must not be empty")
    .max(100, "Chapter title must be at most 100 characters"),
});

/**
 * Max allowed video duration for validation purposes (24 hours).
 * The schema needs an absolute cap because `.max()` requires a
 * static value; the per-video `durationMs` bound is enforced
 * via a `.refine()` below.
 */
const MAX_DURATION_MS = 86_400_000;

/**
 * YouTube's display rules cap a video at 12 visible chapters (the
 * 13th onward are silently dropped in the progress bar).
 */
export const MAX_CHAPTERS = 12;

/**
 * YouTube's hard floor on consecutive-chapter spacing (10 seconds).
 * Anything tighter is rejected by YouTube itself; we also reject it
 * on the server as a first line of defence.
 */
export const MIN_CHAPTER_GAP_MS = 10_000;

/**
 * Soft per-video chapter density hint, computed from the transcript
 * duration. NOT enforced as a hard rule — the prompt tells the LLM
 * to use it as a starting density (you'd expect ~10 chapters from a
 * 30-minute talk) but to match the ACTUAL content rather than hit
 * a target. The LLM can output fewer chapters if the video has few
 * topic shifts, or more if it has many.
 *
 * Used only by `buildSelectHighlightsPrompt`. The schema doesn't
 * enforce the target — see `parseLlmOutput` for the contract.
 */
export interface ChapterBudget {
  /** Lower bound of the LLM's hint range (inclusive). */
  targetMin: number;
  /** Upper bound of the LLM's hint range (inclusive). */
  targetMax: number;
  /** Center of the hint range — used in the prompt as the "natural density". */
  target: number;
}

export const computeChapterBudget = (durationMs: number): ChapterBudget => {
  const durationSeconds = durationMs / 1000;
  // One chapter every ~3 minutes as a starting density, clamped to
  // the YouTube min/max for the hint range.
  const rawTarget = Math.round(durationSeconds / 180);
  const target = Math.max(3, Math.min(MAX_CHAPTERS, rawTarget));
  const targetMin = Math.max(3, target - 2);
  const targetMax = Math.min(MAX_CHAPTERS, target + 2);
  return { targetMin, targetMax, target };
};

/**
 * Base LLM output schema — validates shape + YouTube hard floors.
 * The schema enforces what YouTube itself enforces; the LLM is
 * trusted beyond that to produce content-aware boundaries.
 */
export const LlmOutputSchema = z
  .object({
    summary: z
      .string()
      .max(280, "Summary must be at most 280 characters"),
    chapters: z
      .array(chapterSchema)
      .min(3, "Need at least 3 chapters (YouTube requirement)")
      .max(MAX_CHAPTERS, `At most ${MAX_CHAPTERS} chapters allowed (YouTube display limit)`),
  })
  .refine(
    (o) => o.chapters[0]?.startMs === 0,
    "First chapter must start at exactly 0 ms (YouTube requirement)",
  )
  .refine(
    (o) => {
      for (let i = 1; i < o.chapters.length; i++) {
        const prev = o.chapters[i - 1]!.startMs;
        const curr = o.chapters[i]!.startMs;
        if (curr - prev < MIN_CHAPTER_GAP_MS) return false;
      }
      return true;
    },
    `Consecutive chapters must be at least ${MIN_CHAPTER_GAP_MS} ms apart (YouTube requirement)`,
  );

export type LlmOutput = z.infer<typeof LlmOutputSchema>;

/**
 * Parse the raw LLM response text into a typed `LlmOutput`. Throws a
 * `ZodError` (which `validateWithRetry` catches) on any failure.
 *
 * Three layers:
 *   1. JSON.parse — text → object.
 *   2. `LlmOutputSchema.safeParse(...)` — structural shape + YouTube
 *      hard floors (max 12 chapters, min 10 s gap, first at 0).
 *   3. One dynamic refinement layered on:
 *        - last chapter's `startMs` must be inside the video's
 *          `durationMs`.
 *
 * No per-video GAP rule — the prompt is content-aware (anchored on
 * AssemblyAI's topic segmentation) and we trust it to place chapters
 * at real topic shifts. Schema-enforcing a longer minimum gap would
 * block legitimate tight transitions between related topics.
 *
 * All errors are surfaced as `LlmParseError` so the retry helper
 * can build a single re-prompt message from the failure.
 */
export const parseLlmOutput = (
  text: string,
  durationMs: number,
): LlmOutput => {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new LlmParseError(`Response was not valid JSON: ${detail}`, text);
  }
  const schema = LlmOutputSchema.refine(
    (o) => {
      const last = o.chapters.at(-1);
      return last ? last.startMs < durationMs : true;
    },
    `Last chapter startMs must be less than video duration (${durationMs} ms)`,
  );
  const result = schema.safeParse(json);
  if (!result.success) {
    // We carry the raw text + zod issues so the retry helper can
    // include a specific complaint in the re-prompt.
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new LlmParseError(
      `Response did not match expected shape: ${issues}`,
      text,
    );
  }
  return result.data;
};

/**
 * Custom error type — the LLM client throws `Error`, the JSON parser
 * throws `SyntaxError`, and zod throws `ZodError`. Rather than catch
 * three different types in the retry helper, we funnel everything
 * through one error class with a fixed shape.
 */
export class LlmParseError extends Error {
  readonly rawText: string;
  constructor(message: string, rawText: string) {
    super(message);
    this.name = "LlmParseError";
    this.rawText = rawText;
  }
}
