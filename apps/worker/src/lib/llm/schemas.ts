/**
 * Zod schemas for the `generate` job's LLM output.
 *
 * The LLM is asked to emit a strict JSON object — `{ summary, chapters[] }`
 * — but even with `response_format: { type: "json_object" }` it can
 * still produce JSON that doesn't match our shape. We validate the
 * raw text in two stages:
 *
 *   1. `LlmOutputSchema.safeParse(json)` — checks the structural
 *      shape and applies YouTube chapter rules (first=0, min 3,
 *      min 10 s gap, max 100 chars/title). On failure, the caller
 *      can retry the LLM call with an appended instruction pointing
 *      at the specific failure.
 *
 *   2. Server-side YouTube-rule enforcement is the LAST line of
 *      defence, run after the LLM loop gives up. The validator
 *      never widens what the LLM is allowed to emit; it only
 *      narrows. The publisher still does its own sanitisation
 *      before writing chapters into the YouTube description.
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
 * Base LLM output schema — validates shape, YouTube rules, and
 * static constraints. The duration-bound refinement is applied
 * at parse time in `parseLlmOutput` since it depends on the
 * specific video's length.
 */
export const LlmOutputSchema = z
  .object({
    summary: z
      .string()
      .max(280, "Summary must be at most 280 characters"),
    chapters: z
      .array(chapterSchema)
      .min(3, "Need at least 3 chapters (YouTube requirement)"),
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
        if (curr - prev < 10_000) return false;
      }
      return true;
    },
    "Consecutive chapters must be at least 10 seconds apart (YouTube requirement)",
  );

export type LlmOutput = z.infer<typeof LlmOutputSchema>;

/**
 * Parse the raw LLM response text into a typed `LlmOutput`. Throws a
 * `ZodError` (which `validateWithRetry` catches) on any failure.
 *
 * Two layers:
 *   1. JSON.parse — text → object.
 *   2. LlmOutputSchema refined with `durationMs` — shape + business rules.
 *
 * Both errors are surfaced as the same thrown value so the retry
 * helper can build a single re-prompt message.
 */
export const parseLlmOutput = (text: string, durationMs: number): LlmOutput => {
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
