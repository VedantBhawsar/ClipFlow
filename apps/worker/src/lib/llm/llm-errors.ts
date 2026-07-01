/**
 * LLM error classifier.
 *
 * Mirrors the `classifyAaiError` / `classifyFfmpegError` pattern from
 * the rest of the worker — turns a raw SDK / network error into a
 * typed `{ kind, reasonCode, message }` that the `generate` job uses
 * to decide between "set FAILED" (permanent) and "rethrow for
 * BullMQ backoff" (transient).
 *
 * Permanent (no retry):
 *   - 400 / 422 — model rejected the request. The same payload will
 *     keep getting rejected; retrying just burns budget.
 *   - 401 / 403 — auth / scope. Operator config issue.
 *   - 404 — model id not found on the active provider. Operator config.
 *
 * Transient (retry with BullMQ exponential backoff):
 *   - 429 — rate limit. Cool off and retry.
 *   - 500 / 502 / 503 / 504 — upstream / model server hiccup.
 *   - APIConnectionError / APIConnectionTimeoutError — network / TCP.
 *   - Anything else — defensive default is "transient"; we'd rather
 *     retry a non-retryable once than drop a real failure.
 */
import OpenAI from "openai";

export type LlmErrorKind = "permanent" | "transient";

export interface ClassifiedLlmError {
  kind: LlmErrorKind;
  reasonCode: string;
  message: string;
}

/**
 * Pull a numeric HTTP status off an OpenAI SDK error, or null if the
 * error has no status (network / timeout / parse).
 */
const httpStatusFromError = (err: unknown): number | null => {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  if (err && typeof err === "object" && "statusCode" in err) {
    const status = (err as { statusCode?: unknown }).statusCode;
    if (typeof status === "number") return status;
  }
  return null;
};

/**
 * Classify any error thrown from `OpenAICompatLlmClient.complete` into
 * a typed envelope the `generate` job can switch on.
 */
export const classifyLlmError = (err: unknown): ClassifiedLlmError => {
  // ---- Network / timeout (no HTTP status) ----
  if (err instanceof OpenAI.APIConnectionTimeoutError) {
    return {
      kind: "transient",
      reasonCode: "LLM_TIMEOUT",
      message: "LLM request timed out before reaching the model.",
    };
  }
  if (err instanceof OpenAI.APIConnectionError) {
    return {
      kind: "transient",
      reasonCode: "LLM_NETWORK",
      message: "Network error reaching the LLM endpoint.",
    };
  }

  // ---- Auth / scope (401, 403) ----
  if (err instanceof OpenAI.AuthenticationError) {
    return {
      kind: "permanent",
      reasonCode: "LLM_AUTH",
      message: "LLM provider rejected the API key.",
    };
  }
  if (err instanceof OpenAI.PermissionDeniedError) {
    return {
      kind: "permanent",
      reasonCode: "LLM_SCOPE",
      message: "LLM provider rejected the request scope.",
    };
  }

  // ---- Model / endpoint missing (404) ----
  if (err instanceof OpenAI.NotFoundError) {
    return {
      kind: "permanent",
      reasonCode: "LLM_MODEL_NOT_FOUND",
      message:
        "LLM model id is not available on the active provider. Check LLM_MODEL and LLM_PROVIDER.",
    };
  }

  // ---- Bad request (400, 422) ----
  if (
    err instanceof OpenAI.BadRequestError ||
    err instanceof OpenAI.UnprocessableEntityError
  ) {
    return {
      kind: "permanent",
      reasonCode: "LLM_BAD_REQUEST",
      message: "LLM provider rejected the request payload.",
    };
  }

  // ---- Rate limit (429) ----
  if (err instanceof OpenAI.RateLimitError) {
    return {
      kind: "transient",
      reasonCode: "LLM_RATE_LIMIT",
      message: "LLM provider rate-limited the request.",
    };
  }

  // ---- Upstream / 5xx (500, 502, 503, 504) ----
  if (err instanceof OpenAI.InternalServerError) {
    return {
      kind: "transient",
      reasonCode: "LLM_UPSTREAM",
      message: "LLM provider returned a 5xx.",
    };
  }

  // ---- Generic APIError without a known subclass ----
  if (err instanceof OpenAI.APIError) {
    const status = err.status ?? httpStatusFromError(err);
    if (status === 429) {
      return {
        kind: "transient",
        reasonCode: "LLM_RATE_LIMIT",
        message: "LLM provider rate-limited the request.",
      };
    }
    if (status !== null && status >= 500) {
      return {
        kind: "transient",
        reasonCode: "LLM_UPSTREAM",
        message: `LLM provider returned ${status}.`,
      };
    }
    if (status !== null && status >= 400) {
      return {
        kind: "permanent",
        reasonCode: "LLM_BAD_REQUEST",
        message: `LLM provider rejected the request (HTTP ${status}).`,
      };
    }
    return {
      kind: "transient",
      reasonCode: "LLM_UPSTREAM",
      message: err.message || "Unknown LLM API error.",
    };
  }

  // ---- JSON-parse failure (caller-side, not SDK) ----
  if (err instanceof SyntaxError) {
    return {
      kind: "permanent",
      reasonCode: "LLM_BAD_OUTPUT",
      message: "LLM response was not valid JSON.",
    };
  }

  // ---- Defensive default: transient ----
  // We'd rather retry a non-retryable once than drop a real failure.
  const fallbackMessage =
    err instanceof Error ? err.message : String(err);
  return {
    kind: "transient",
    reasonCode: "LLM_UPSTREAM",
    message: fallbackMessage || "Unknown LLM error.",
  };
};
