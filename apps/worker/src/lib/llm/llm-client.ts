/**
 * LLM client — OpenAI-compatible.
 *
 * Wraps the `openai` npm SDK with a configurable `baseURL` so the same
 * wrapper can talk to either:
 *
 *   - NVIDIA's NIM endpoint (default). NVIDIA hosts Llama 3.1 70B,
 *     Nemotron, Mixtral, etc. on an OpenAI-compatible request/response
 *     shape; the only thing that changes from the SDK's perspective is
 *     the base URL and the model id.
 *   - OpenAI's api.openai.com. Same wrapper, just no `baseURL` override.
 *
 * Why one wrapper, not separate NVIDIA / OpenAI clients: the wire shape
 * is identical. Adding a second class would mean duplicating the same
 * retry / JSON-mode / temperature logic. Future Anthropic support will
 * need a sibling wrapper (different SDK, different wire format).
 *
 * The wrapper is intentionally thin — it does NOT retry, log, or
 * classify errors. That work lives in the caller (the `generate` job
 * + `llm-errors.ts`) so this layer stays trivially mockable in tests.
 */
import OpenAI from "openai";
import type { Env } from "@clipflow/config";

/**
 * Public completion request shape. Provider-agnostic — the same fields
 * work against OpenAI and NVIDIA NIM.
 */
export interface LlmCompletionRequest {
  /** System prompt. Sets behaviour / output contract for the model. */
  systemPrompt: string;
  /** User prompt. The actual content the model reasons over. */
  userPrompt: string;
  /**
   * If true, ask the model to format its response as a JSON object.
   * Default true — the `generate` job's contract is JSON. Both OpenAI
   * and NVIDIA NIM support this via `response_format: { type: "json_object" }`.
   */
  jsonMode?: boolean;
  /** Optional model id override. Falls back to the client's default. */
  model?: string;
  /** Max tokens in the response. Default 1024 — fits summary + 10 chapters. */
  maxTokens?: number;
  /** Sampling temperature. Default 0.2 — low for deterministic JSON. */
  temperature?: number;
}

/**
 * Completion result — the raw text + the original SDK response object
 * (so callers can log token usage / finish reason if they want).
 */
export interface LlmCompletionResult {
  text: string;
  /** Raw SDK response — exposed for logging, not for parsing. */
  raw: unknown;
  /** Token usage, parsed off the SDK response when present. */
  usage?: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
}

/**
 * Build the per-provider config tuple. Pure factory — no I/O, no SDK
 * instantiation. Throws when the active provider's API key is missing
 * so the `generate` job surfaces a typed `[LLM_AUTH]` permanent failure
 * (via `classifyLlmError`) instead of a generic SDK auth error.
 */
const buildProviderConfig = (
  env: Env,
): { apiKey: string; baseURL: string; model: string } => {
  if (env.LLM_PROVIDER === "nvidia") {
    if (!env.NVIDIA_API_KEY) {
      throw new Error("[LLM_AUTH] NVIDIA_API_KEY is not configured.");
    }
    return {
      apiKey: env.NVIDIA_API_KEY,
      baseURL: env.NVIDIA_BASE_URL,
      model: env.LLM_MODEL,
    };
  }
  if (env.LLM_PROVIDER === "openai") {
    if (!env.OPENAI_API_KEY) {
      throw new Error("[LLM_AUTH] OPENAI_API_KEY is not configured.");
    }
    return {
      apiKey: env.OPENAI_API_KEY,
      // No baseURL — the SDK default points at api.openai.com/v1.
      baseURL: undefined as unknown as string, // see constructor
      model: env.LLM_MODEL,
    };
  }
  // `claude` is reserved for the future Anthropic adapter.
  throw new Error(
    `[LLM_PROVIDER] LLM_PROVIDER=${env.LLM_PROVIDER} is not yet implemented. Use "nvidia" or "openai".`,
  );
};

/**
 * OpenAI-compatible LLM client. One instance per worker process —
 * created at boot, passed to the `generate` job via `ProcessContext`.
 *
 * The underlying `openai` SDK is the same one used for the OpenAI
 * provider; NVIDIA NIM is wire-compatible so a `baseURL` swap is all
 * that's needed.
 */
export class OpenAICompatLlmClient {
  private readonly client: OpenAI;
  private readonly defaultModel: string;

  constructor(env: Env) {
    const cfg = buildProviderConfig(env);
    // The OpenAI SDK accepts `undefined` for baseURL to mean "use the
    // default". We don't pre-strip it here because the TS type wants
    // a string; the constructor does the strip so the wire path is
    // unambiguous.
    this.client = new OpenAI({
      apiKey: cfg.apiKey,
      ...(env.LLM_PROVIDER === "openai" ? {} : { baseURL: cfg.baseURL }),
    });
    this.defaultModel = cfg.model;
  }

  /**
   * Send a single chat-completion request. Throws on any non-2xx —
   * the caller (`generate` job) classifies via `classifyLlmError`.
   *
   * The `response_format: { type: "json_object" }` flag is what makes
   * the model emit valid JSON reliably. Both OpenAI and NVIDIA NIM
   * Llama 3.1 support it; if the active model doesn't, the SDK still
   * returns the text and the caller's zod validator handles it.
   */
  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const completion = await this.client.chat.completions.create({
      model: req.model ?? this.defaultModel,
      messages: [
        { role: "system", content: req.systemPrompt },
        { role: "user", content: req.userPrompt },
      ],
      // `json_object` is the OpenAI-compatible JSON mode. NVIDIA NIM
      // accepts the same flag. If the active model doesn't support
      // it the SDK surfaces an error which classifyLlmError maps to
      // a transient retry.
      ...(req.jsonMode !== false
        ? { response_format: { type: "json_object" as const } }
        : {}),
      max_tokens: req.maxTokens ?? 1024,
      temperature: req.temperature ?? 0.2,
    });

    const choice = completion.choices[0];
    const text = choice?.message?.content ?? "";

    let usage: LlmCompletionResult["usage"];
    if (completion.usage) {
      usage = {
        promptTokens: completion.usage.prompt_tokens ?? null,
        completionTokens: completion.usage.completion_tokens ?? null,
        totalTokens: completion.usage.total_tokens ?? null,
      };
    }

    

    return { text, raw: completion, usage };
  }
}

/**
 * Factory used by the `generate` job — builds the right client for the
 * active `LLM_PROVIDER`. Kept as a separate export so tests can
 * substitute a mock without touching the constructor.
 */
export const buildLlmClient = (env: Env): OpenAICompatLlmClient =>
  new OpenAICompatLlmClient(env);
