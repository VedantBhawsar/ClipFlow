/**
 * `validateWithRetry` — turn the LLM's "I tried, here is something
 * weird" output into either a clean typed result or a permanent
 * failure, by re-prompting the LLM up to `maxRetries` times with the
 * specific complaint appended.
 *
 * Why a server-side retry loop rather than a bigger prompt:
 *   - Costs less than baking every rule into the system prompt.
 *   - Pinpoints the failure ("first chapter must be 0 — yours was 1234")
 *     so the LLM has something concrete to fix on the next attempt.
 *   - Caps the worst case (3 attempts) so a misbehaving model can't
 *     burn the whole job budget.
 *
 * The function does NOT classify SDK errors. That lives in
 * `llm-errors.ts` and runs in the caller before `validateWithRetry`
 * is invoked. This helper only handles "model returned text that
 * doesn't parse / doesn't match the schema".
 */
import type { OpenAICompatLlmClient, LlmCompletionRequest } from "./llm-client.js";
import {
  LlmParseError,
  parseLlmOutput,
  type LlmOutput,
} from "./schemas.js";

export interface ValidateWithRetryOptions {
  /** The LLM client. */
  client: OpenAICompatLlmClient;
  /** The original completion request (system + user prompt, json mode, etc.). */
  request: LlmCompletionRequest;
  /** Max attempts INCLUDING the first try. Default 3. */
  maxAttempts?: number;
  /** Video duration in ms — used to validate chapter boundaries don't exceed the video. */
  durationMs: number;
}

export interface ValidateWithRetryResult {
  output: LlmOutput;
  /** Number of attempts it took (1 = first try succeeded). */
  attempts: number;
  /**
   * If the LLM returned text on a failed attempt, the raw text from
   * the last failure. Useful for logging when retries are exhausted.
   */
  lastRawText?: string;
}

/**
 * Run `request` against the LLM, parse the response, and re-prompt
 * with a "your last response was wrong because X" prefix on parse
 * failure. Returns the first valid result, or throws on
 * `maxAttempts` failures.
 */
export const validateWithRetry = async (
  opts: ValidateWithRetryOptions,
): Promise<ValidateWithRetryResult> => {
  const max = opts.maxAttempts ?? 3;
  const durationMs = opts.durationMs;
  let lastError: Error | null = null;
  let lastRawText: string | undefined;

  for (let attempt = 1; attempt <= max; attempt++) {
    const isRetry = attempt > 1;
    const requestForAttempt: LlmCompletionRequest = isRetry
      ? {
          ...opts.request,
          // Append a concrete complaint + a reminder of the contract.
          // Keeping the system prompt identical and tacking on the
          // user-side correction means the model's role stays
          // stable across attempts.
          userPrompt: `${opts.request.userPrompt}\n\n---\nYOUR PREVIOUS RESPONSE WAS REJECTED:\n${lastError?.message ?? "unknown error"}\n\nPlease re-emit the JSON object, this time satisfying every rule above. Output ONLY the JSON.`,
        }
      : opts.request;

    const result = await opts.client.complete(requestForAttempt);
    lastRawText = result.text;
    try {
      const output = parseLlmOutput(result.text, durationMs);
      return { output, attempts: attempt, lastRawText };
    } catch (err) {
      if (err instanceof LlmParseError) {
        lastError = err;
        // Loop and retry.
        continue;
      }
      // Unknown error type — re-throw so the caller's classify
      // path can decide. (parseLlmOutput only throws LlmParseError
      // or SyntaxError, both of which we funnel to LlmParseError,
      // so this is belt-and-braces.)
      throw err;
    }
  }

  // Out of attempts. The job's caller treats parse failure as a
  // PERMANENT failure — retrying the whole job (via BullMQ) would
  // re-run the LLM with the same prompt and likely fail the same
  // way, so we just surface the last error.
  throw new Error(
    `[LLM_BAD_OUTPUT] LLM response failed validation after ${max} attempts. Last error: ${lastError?.message ?? "unknown"}`,
  );
};
