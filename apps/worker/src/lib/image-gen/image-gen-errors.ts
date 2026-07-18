export interface ClassifiedImageGenError {
  kind: "permanent" | "transient";
  reasonCode: string;
  message: string;
}

const PERMANENT_CODES = [
  "GEMINI_AUTH",
  "GEMINI_SCOPE",
  "GEMINI_MODEL_NOT_FOUND",
  "GEMINI_BAD_REQUEST",
  "GEMINI_SAFETY",
  "REPLICATE_AUTH",
  "REPLICATE_MODEL_NOT_FOUND",
  "REPLICATE_BAD_REQUEST",
  "NVIDIA_AUTH",
  "NVIDIA_MODEL_NOT_FOUND",
  "NVIDIA_BAD_REQUEST",
  "IMG_UNSUPPORTED_FORMAT",
  "IMG_TOO_LARGE",
  "IMG_CONTENT_FILTERED",
];

const TRANSIENT_CODES = [
  "GEMINI_RATE_LIMIT",
  "GEMINI_UPSTREAM",
  "GEMINI_TIMEOUT",
  "REPLICATE_RATE_LIMIT",
  "REPLICATE_UPSTREAM",
  "REPLICATE_TIMEOUT",
  "NVIDIA_RATE_LIMIT",
  "NVIDIA_UPSTREAM",
  "NVIDIA_TIMEOUT",
  "IMG_NETWORK",
];

export const classifyImageGenError = (err: unknown): ClassifiedImageGenError => {
  if (err instanceof ImageGenError) {
    if (PERMANENT_CODES.includes(err.code)) {
      return { kind: "permanent", reasonCode: err.code, message: err.message };
    }
    if (TRANSIENT_CODES.includes(err.code)) {
      return { kind: "transient", reasonCode: err.code, message: err.message };
    }
  }
  return { kind: "transient", reasonCode: "IMG_NETWORK", message: "Unexpected image generation error" };
};

export class ImageGenError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ImageGenError";
  }
}

/**
 * SDK-level error detection.
 *
 * `ApiError` lives in `@google/genai` and exposes `.status` (HTTP) + a
 * standard `.message`. The SDK uses a single class for every HTTP failure
 * (auth, rate-limit, model-not-found, upstream 5xx) — only the status
 * differs. We detect SDK errors by shape (presence of a numeric `status`
 * field) rather than class identity so the check survives dynamic import
 * and test mocks where `instanceof` would fail.
 */
const looksLikeSdkApiError = (err: unknown): err is { status: number; message?: string } & Error => {
  if (!err || typeof err !== "object") return false;
  if (typeof (err as { status?: unknown }).status !== "number") return false;
  return true;
};

/**
 * Translate an `@google/genai` `ApiError` into our `ImageGenError` code
 * space. Mirrors the bucketing the hand-rolled REST client used to do
 * (401/403 → auth, 404 → model-not-found, 429 → rate-limit, etc.) so the
 * BullMQ jobs' permanent-vs-transient branching is unchanged.
 *
 * Unknown statuses fall through to `GEMINI_UPSTREAM` (transient) — better
 * to retry than to permanently fail a job we don't recognise.
 */
export const mapSdkApiError = (err: unknown): ImageGenError => {
  if (!looksLikeSdkApiError(err)) {
    const msg = err instanceof Error ? err.message : String(err);
    return new ImageGenError("GEMINI_UPSTREAM", `Gemini SDK error: ${msg}`);
  }

  const status = err.status;
  const message = err.message ?? "Unknown Gemini error";

  if (status === 429) {
    return new ImageGenError("GEMINI_RATE_LIMIT", `Gemini rate limit: ${message}`);
  }
  if (status === 401 || status === 403) {
    return new ImageGenError("GEMINI_AUTH", `Gemini auth error: ${message}`);
  }
  if (status === 404) {
    return new ImageGenError("GEMINI_MODEL_NOT_FOUND", `Gemini model not found: ${message}`);
  }
  if (status === 400) {
    return new ImageGenError("GEMINI_BAD_REQUEST", `Gemini bad request: ${message}`);
  }
  if (status >= 500) {
    return new ImageGenError("GEMINI_UPSTREAM", `Gemini upstream error: ${message}`);
  }
  return new ImageGenError("GEMINI_UPSTREAM", `Gemini error (${status}): ${message}`);
};

/**
 * Async wrapper used by the SDK-based client. Exists so call-sites that
 * want a Promise-typed mapper have one — the sync `mapSdkApiError` is the
 * canonical implementation.
 */
export const mapSdkErrorToImageGenError = async (err: unknown): Promise<ImageGenError> =>
  mapSdkApiError(err);

/**
 * Translate Nvidia API HTTP status codes and error responses to ImageGenError.
 */
export const mapNvidiaApiError = (status: number, message: string): ImageGenError => {
  if (status === 429) {
    return new ImageGenError("NVIDIA_RATE_LIMIT", `NVIDIA rate limit: ${message}`);
  }
  if (status === 401 || status === 403) {
    return new ImageGenError("NVIDIA_AUTH", `NVIDIA auth error: ${message}`);
  }
  if (status === 404) {
    return new ImageGenError("NVIDIA_MODEL_NOT_FOUND", `NVIDIA model not found: ${message}`);
  }
  if (status === 400 || status === 422) {
    return new ImageGenError("NVIDIA_BAD_REQUEST", `NVIDIA bad request: ${message}`);
  }
  if (status >= 500) {
    return new ImageGenError("NVIDIA_UPSTREAM", `NVIDIA upstream error: ${message}`);
  }
  return new ImageGenError("NVIDIA_UPSTREAM", `NVIDIA error (${status}): ${message}`);
};
