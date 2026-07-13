/**
 * Unit tests for `OpenAICompatLlmClient`.
 *
 * Strategy: mock the `openai` module so that `new OpenAI(...)` returns
 * a stub with a `chat.completions.create` method we control. The
 * client wrapper is a thin facade over the SDK — we want to lock
 * down:
 *   - The right config (apiKey, baseURL) is passed for each provider.
 *   - The right request shape (system + user + json mode) reaches the
 *     SDK.
 *   - The result is unwrapped into `{ text, raw, usage }` correctly.
 *   - Missing keys throw `[LLM_AUTH]` so `classifyLlmError` can pick
 *     them up uniformly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "@clipflow/config";
import { OpenAICompatLlmClient } from "./llm-client.js";

const {
  mockChatCompletionsCreate,
  mockOpenAIConstructor,
  lastConstructorOpts,
} = vi.hoisted(() => {
  const mockChatCompletionsCreate = vi.fn();
  const mockOpenAIConstructor = vi.fn();
  let lastConstructorOpts: Record<string, unknown> = {};
  return {
    mockChatCompletionsCreate,
    mockOpenAIConstructor,
    lastConstructorOpts: {
      get value() {
        return lastConstructorOpts;
      },
      set value(v: Record<string, unknown>) {
        lastConstructorOpts = v;
      },
    },
  };
});

// Mock the `openai` module so `new OpenAI({...})` returns a stub.
// The stub captures the constructor opts (for assertions) and exposes
// a fully mockable `chat.completions.create`.
vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockChatCompletionsCreate,
        },
      };
      constructor(opts: Record<string, unknown>) {
        lastConstructorOpts.value = opts;
        mockOpenAIConstructor(opts);
      }
    },
  };
});

/**
 * Minimal valid Env stub. The LLM client only reads LLM_PROVIDER,
 * NVIDIA_API_KEY, NVIDIA_BASE_URL, OPENAI_API_KEY, LLM_MODEL. Other
 * fields are required by the type but never touched.
 */
const baseEnv: Env = {
  NODE_ENV: "test",
  PORT: 4000,
  WEB_ORIGIN: "http://localhost:3000",
  DATABASE_URL: "postgresql://localhost:5432/test",
  REDIS_URL: undefined,
  JWT_SECRET: "super-secret-key-that-is-at-least-32-chars",
  JWT_EXPIRES_IN: "15m",
  REFRESH_TOKEN_EXPIRES_IN: "7d",
  ENCRYPTION_KEY: "super-secret-encryption-key-32chars",
  GOOGLE_CLIENT_ID: undefined,
  GOOGLE_CLIENT_SECRET: undefined,
  GOOGLE_REDIRECT_URI: undefined,
  RATE_LIMIT_WINDOW_MS: 900_000,
  RATE_LIMIT_MAX: 100,
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_SECRET_ACCESS_KEY: "minioadmin",
  S3_BUCKET: "clipflow-videos",
  S3_FORCE_PATH_STYLE: true,
  BULLMQ_PREFIX: "clipflow",
  YOUTUBE_CATEGORY_DEFAULT: "22",
  YOUTUBE_MAX_VIDEO_BYTES: 5 * 1024 * 1024 * 1024,
  YOUTUBE_PRESIGNED_POST_TTL: 900,
  FFMPEG_PATH: "ffmpeg",
  ASSEMBLYAI_API_KEY: "test-aai-key-min-20-chars",
  LLM_PROVIDER: "nvidia",
  ANTHROPIC_API_KEY: undefined,
  OPENAI_API_KEY: undefined,
  NVIDIA_API_KEY: "test-nvidia-key-min-20-chars",
  NVIDIA_BASE_URL: "https://integrate.api.nvidia.com/v1",
  LLM_MODEL: "meta/llama-3.1-70b-instruct",
  TRANSCRIBE_POLL_MS: 2_000,
  TRANSCRIBE_TIMEOUT_MS: 15 * 60_000,
  SMTP_PORT: 587,
  SMTP_FROM: "noreply@clipflow.com",
  IMAGE_GEN_PROVIDER: "gemini",
  GEMINI_API_KEY: "test-gemini-key-min-20-chars",
  GEMINI_IMAGE_MODEL: "gemini-2.0-flash-exp-image-generation",
  GEMINI_VISION_MODEL: "gemini-2.0-flash-001",
  REPLICATE_API_TOKEN: undefined,
  REPLICATE_IMAGE_MODEL: "black-forest-labs/flux-pro",
  THUMBNAILS_PER_VIDEO: 5,
  THUMBNAIL_VISION_ENABLED: true,
  DODO_PAYMENTS_API_KEY: "test-dodo-api-key-min-20-chars",
  DODO_PAYMENTS_WEBHOOK_SECRET: "test-dodo-webhook-secret-min-20-chars",
  DODO_PAYMENTS_ENVIRONMENT: "test_mode",
};

beforeEach(() => {
  vi.clearAllMocks();
  lastConstructorOpts.value = {};
});

describe("OpenAICompatLlmClient — constructor", () => {
  describe("nvidia provider", () => {
    it("instantiates the SDK with the NVIDIA API key and base URL", () => {
      new OpenAICompatLlmClient(baseEnv);

      expect(mockOpenAIConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: baseEnv.NVIDIA_API_KEY,
          baseURL: baseEnv.NVIDIA_BASE_URL,
        }),
      );
    });

    it("throws [LLM_AUTH] when NVIDIA_API_KEY is missing", () => {
      expect(() => new OpenAICompatLlmClient({
        ...baseEnv,
        NVIDIA_API_KEY: undefined,
      })).toThrow(/\[LLM_AUTH\].*NVIDIA_API_KEY/);
    });
  });

  describe("openai provider", () => {
    it("instantiates the SDK with the OpenAI API key and no baseURL override", () => {
      new OpenAICompatLlmClient({
        ...baseEnv,
        LLM_PROVIDER: "openai",
        OPENAI_API_KEY: "test-openai-key-min-20-chars",
      });

      const opts = lastConstructorOpts.value;
      expect(opts).toMatchObject({ apiKey: "test-openai-key-min-20-chars" });
      // The wrapper explicitly omits `baseURL` for the openai provider
      // so the SDK uses its default api.openai.com endpoint.
      expect(opts).not.toHaveProperty("baseURL");
    });

    it("throws [LLM_AUTH] when OPENAI_API_KEY is missing", () => {
      expect(() => new OpenAICompatLlmClient({
        ...baseEnv,
        LLM_PROVIDER: "openai",
        OPENAI_API_KEY: undefined,
      })).toThrow(/\[LLM_AUTH\].*OPENAI_API_KEY/);
    });
  });

  describe("claude provider (reserved)", () => {
    it("throws because the v1.5 wrapper does not implement Anthropic", () => {
      expect(() => new OpenAICompatLlmClient({
        ...baseEnv,
        LLM_PROVIDER: "claude",
        ANTHROPIC_API_KEY: "test-anthropic-key-min-20-chars",
      })).toThrow(/\[LLM_PROVIDER\].*not yet implemented/);
    });
  });
});

describe("OpenAICompatLlmClient — complete()", () => {
  it("sends system + user messages and enables JSON mode by default", async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '{"summary":"x","chapters":[]}' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const client = new OpenAICompatLlmClient(baseEnv);
    await client.complete({
      systemPrompt: "be brief",
      userPrompt: "hi",
    });

    expect(mockChatCompletionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "meta/llama-3.1-70b-instruct",
        messages: [
          { role: "system", content: "be brief" },
          { role: "user", content: "hi" },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1024,
        temperature: 0.2,
      }),
    );
  });

  it("omits response_format when jsonMode is false", async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "plain text reply" } }],
    });

    const client = new OpenAICompatLlmClient(baseEnv);
    await client.complete({
      systemPrompt: "be chatty",
      userPrompt: "hi",
      jsonMode: false,
    });

    const call = mockChatCompletionsCreate.mock.calls[0]![0];
    expect(call).not.toHaveProperty("response_format");
  });

  it("honors a per-request model override", async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "{}" } }],
    });

    const client = new OpenAICompatLlmClient(baseEnv);
    await client.complete({
      systemPrompt: "x",
      userPrompt: "y",
      model: "meta/llama-3.3-70b-instruct",
    });

    expect(mockChatCompletionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "meta/llama-3.3-70b-instruct" }),
    );
  });

  it("honors per-request maxTokens and temperature", async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "{}" } }],
    });

    const client = new OpenAICompatLlmClient(baseEnv);
    await client.complete({
      systemPrompt: "x",
      userPrompt: "y",
      maxTokens: 2048,
      temperature: 0.7,
    });

    expect(mockChatCompletionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 2048, temperature: 0.7 }),
    );
  });

  it("returns { text, raw, usage } unwrapped from the SDK response", async () => {
    const rawResponse = {
      choices: [{ message: { content: "the model said this" } }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    };
    mockChatCompletionsCreate.mockResolvedValueOnce(rawResponse);

    const client = new OpenAICompatLlmClient(baseEnv);
    const out = await client.complete({
      systemPrompt: "x",
      userPrompt: "y",
    });

    expect(out.text).toBe("the model said this");
    expect(out.raw).toBe(rawResponse);
    expect(out.usage).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
  });

  it("returns usage with null fields when SDK omits usage", async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "x" } }],
      // no `usage` field
    });

    const client = new OpenAICompatLlmClient(baseEnv);
    const out = await client.complete({ systemPrompt: "x", userPrompt: "y" });

    expect(out.usage).toBeUndefined();
  });

  it("returns empty text when the SDK returns no choices", async () => {
    mockChatCompletionsCreate.mockResolvedValueOnce({
      choices: [],
    });

    const client = new OpenAICompatLlmClient(baseEnv);
    const out = await client.complete({ systemPrompt: "x", userPrompt: "y" });

    expect(out.text).toBe("");
  });
});