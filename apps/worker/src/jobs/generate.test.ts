/**
 * Unit tests for the `generate` BullMQ job.
 *
 * Strategy: mock Prisma, S3, the LLM client, and the events publisher.
 * The job's job is to:
 *   - guard against missing rows / missing transcript / missing LLM key,
 *   - persist the LLM output (summary + chapters) to `chaptersJson`,
 *   - flip the row to READY_FOR_REVIEW with the right fields.
 *
 * We do NOT exercise the LLM SDK's HTTP behavior — the
 * `llm-client.test.ts` / `llm-errors.test.ts` suites already cover
 * that layer in isolation. Here we treat the LLM surface as a black
 * box that either resolves to a validated `LlmOutput` or throws.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import type { Job } from "bullmq";
import type { Env } from "@clipflow/config";
import {
  processGenerateJob,
  type GenerateJobData,
} from "./generate.js";

// ---- Mocks ----
//
// `vi.hoisted` because `vi.mock` factories run before module-level
// `const` declarations are initialised. Using `vi.hoisted` keeps the
// mock references resolvable at hoist time (see
// https://vitest.dev/api/vi.html#vi-hoisted).
const {
  mockPrismaVideoFindUnique,
  mockPrismaVideoUpdate,
  mockGetObjectStream,
  mockBuildS3Config,
  mockGetS3Client,
  mockLlmComplete,
  mockLlmClassify,
  mockValidateWithRetry,
  mockEventsPublish,
} = vi.hoisted(() => ({
  mockPrismaVideoFindUnique: vi.fn(),
  mockPrismaVideoUpdate: vi.fn(),
  mockGetObjectStream: vi.fn(),
  mockBuildS3Config: vi.fn(),
  mockGetS3Client: vi.fn(),
  mockLlmComplete: vi.fn(),
  mockLlmClassify: vi.fn(),
  mockValidateWithRetry: vi.fn(),
  mockEventsPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@clipflow/db", () => ({
  prisma: {
    video: {
      findUnique: mockPrismaVideoFindUnique,
      update: mockPrismaVideoUpdate,
    },
  },
}));

vi.mock("@clipflow/s3", () => ({
  buildS3Config: mockBuildS3Config.mockReturnValue({
    bucket: "test-bucket",
    region: "us-east-1",
  }),
  getS3Client: mockGetS3Client.mockReturnValue({}),
  getObjectStream: mockGetObjectStream,
}));

// Mock the entire LLM barrel. The job uses five exports; each gets
// its own stub. `OpenAICompatLlmClient` becomes a class with a
// mockable `.complete()`; the helpers are direct vi.fn()s.
vi.mock("../lib/llm/index.js", () => ({
  OpenAICompatLlmClient: class {
    complete = mockLlmComplete;
  },
  buildSelectHighlightsPrompt: vi.fn(() => ({
    systemPrompt: "SYS",
    userPrompt: "USR",
  })),
  classifyLlmError: mockLlmClassify,
  validateWithRetry: mockValidateWithRetry,
}));

vi.mock("../lib/events.js", () => ({
  WorkerEventPublisher: class {
    publish = mockEventsPublish;
  },
}));

// ---- Helpers ----

const makeMockJob = (
  videoId: string,
  attemptsMade = 0,
): Job<GenerateJobData> =>
  ({
    id: `job-${videoId}`,
    data: { videoId },
    attemptsMade,
  }) as never;

const buildMockCtx = (env: Partial<Env> = {}) => {
  const fullEnv: Env = {
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
    NVIDIA_IMAGE_MODEL: "black-forest-labs/flux.1-dev",
    THUMBNAILS_PER_VIDEO: 5,
    THUMBNAIL_VISION_ENABLED: true,
    DODO_PAYMENTS_API_KEY: "test-dodo-api-key-min-20-chars",
    DODO_PAYMENTS_WEBHOOK_SECRET: "test-dodo-webhook-secret-min-20-chars",
    DODO_PAYMENTS_ENVIRONMENT: "test_mode",
    ...env,
  };

  return {
    env: fullEnv,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      fatal: vi.fn(),
    },
    events: {
      publish: mockEventsPublish,
    },
  };
};

/**
 * Build a minimal transcript JSON fixture that satisfies the
 * `transcript.text` + `transcript.words` shape the job requires.
 */
const buildTranscriptJson = (overrides: Record<string, unknown> = {}) => ({
  id: "aai-123",
  status: "completed" as const,
  text: "Hello world. This is a short transcript for testing.",
  words: [
    { text: "Hello", startMs: 0, endMs: 500, confidence: 0.99 },
    { text: "world.", startMs: 500, endMs: 1_000, confidence: 0.98 },
  ],
  chapters: [
    {
      startMs: 0,
      endMs: 5_000,
      gist: "intro",
      headline: "Intro",
      summary: "The host says hello.",
    },
  ],
  languageCode: "en",
  durationMs: 5_000,
  ...overrides,
});

/**
 * Build a stream-shaped body the S3 mock returns. Mirrors the
 * transcription test's pattern.
 */
const makeS3BodyFrom = (json: unknown) => {
  const text = JSON.stringify(json);
  const data = Buffer.from(text, "utf8");
  return {
    body: {
      transformToWebStream: () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue(data);
            controller.close();
          },
        }),
    },
    contentLength: data.length,
  };
};

const audioTempDir = mkdtempSync(join(tmpdir(), "clipflow-generate-test-"));

describe("processGenerateJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Pre-stage a transcript.json in temp so the S3 mock can stream it.
    const transcriptPath = join(audioTempDir, "transcript.json");
    writeFileSync(transcriptPath, JSON.stringify(buildTranscriptJson()));

    mockGetObjectStream.mockImplementation(async () =>
      makeS3BodyFrom(buildTranscriptJson()),
    );

    // Default LLM success path.
    mockValidateWithRetry.mockResolvedValue({
      output: {
        summary: "Generated summary of the video.",
        chapters: [
          { startMs: 0, title: "Intro" },
          { startMs: 12_000, title: "Main" },
          { startMs: 24_000, title: "Wrap" },
        ],
      },
      attempts: 1,
    });
    mockLlmClassify.mockImplementation((err: unknown) => ({
      kind: "permanent" as const,
      reasonCode: "LLM_BAD_OUTPUT",
      message: err instanceof Error ? err.message : String(err),
    }));

    // Suppress noise: the happy path logs `LLM returned valid output`
    // once on success, plus `Transcript loaded`. Leave default mock.
  });

  describe("guard rails", () => {
    it("skips when the video row is missing", async () => {
      mockPrismaVideoFindUnique.mockResolvedValue(null);
      const ctx = buildMockCtx();

      await processGenerateJob(makeMockJob("vid_missing"), ctx as never);

      expect(mockPrismaVideoUpdate).not.toHaveBeenCalled();
      expect(mockValidateWithRetry).not.toHaveBeenCalled();
      expect(ctx.logger.warn).toHaveBeenCalledWith(
        { videoId: "vid_missing" },
        "Video row missing — skipping generate",
      );
    });

    it("skips when the row already has chaptersJson (idempotent)", async () => {
      mockPrismaVideoFindUnique.mockResolvedValue({
        userId: "user-1",
        transcriptS3Key: "videos/vid_x/transcript.json",
        chaptersJson: {
          summary: "already done",
          chapters: [{ startMs: 0, title: "A" }],
        },
        status: "READY_FOR_REVIEW",
      });
      const ctx = buildMockCtx();

      await processGenerateJob(makeMockJob("vid_x"), ctx as never);

      expect(mockPrismaVideoUpdate).not.toHaveBeenCalled();
      expect(mockValidateWithRetry).not.toHaveBeenCalled();
      expect(ctx.logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ hasChapters: true }),
        "Video already has chaptersJson — skipping (idempotent)",
      );
    });

    it("marks FAILED with [GEN_TRANSCRIPT_MISSING] when transcriptS3Key is null", async () => {
      mockPrismaVideoFindUnique.mockResolvedValue({
        userId: "user-1",
        transcriptS3Key: null,
        chaptersJson: null,
        status: "GENERATING",
      });
      mockPrismaVideoUpdate.mockResolvedValue({});
      const ctx = buildMockCtx();

      await processGenerateJob(
        makeMockJob("vid_no_transcript"),
        ctx as never,
      );

      expect(mockPrismaVideoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "vid_no_transcript" },
          data: expect.objectContaining({
            status: "FAILED",
            failureReason: expect.stringContaining("[GEN_TRANSCRIPT_MISSING]"),
          }),
        }),
      );

      // SSE: STATUS_UPDATE + ERROR
      const statusUpdates = mockEventsPublish.mock.calls
        .map(([evt]) => evt)
        .filter((evt) => evt.type === "STATUS_UPDATE");
      const errorEvents = mockEventsPublish.mock.calls
        .map(([evt]) => evt)
        .filter((evt) => evt.type === "ERROR");
      expect(statusUpdates).toHaveLength(1);
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0]!.error).toContain("[GEN_TRANSCRIPT_MISSING]");
    });
  });

  describe("transcript parsing", () => {
    it("marks FAILED with [GEN_TRANSCRIPT_PARSE_ERROR] when S3 JSON is malformed", async () => {
      mockPrismaVideoFindUnique.mockResolvedValue({
        userId: "user-1",
        transcriptS3Key: "videos/vid_bad/transcript.json",
        chaptersJson: null,
        status: "GENERATING",
      });
      mockGetObjectStream.mockImplementation(async () => ({
        body: {
          transformToWebStream: () =>
            new ReadableStream({
              start(controller) {
                controller.enqueue(Buffer.from("{ not json", "utf8"));
                controller.close();
              },
            }),
        },
        contentLength: 9,
      }));
      mockPrismaVideoUpdate.mockResolvedValue({});
      const ctx = buildMockCtx();

      await processGenerateJob(
        makeMockJob("vid_bad_transcript"),
        ctx as never,
      );

      expect(mockPrismaVideoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "FAILED",
            failureReason: expect.stringContaining(
              "[GEN_TRANSCRIPT_PARSE_ERROR]",
            ),
          }),
        }),
      );
      expect(mockValidateWithRetry).not.toHaveBeenCalled();
    });

    it("marks FAILED when transcript is missing required fields", async () => {
      mockPrismaVideoFindUnique.mockResolvedValue({
        userId: "user-1",
        transcriptS3Key: "videos/vid_x/transcript.json",
        chaptersJson: null,
        status: "GENERATING",
      });
      // text is missing
      mockGetObjectStream.mockImplementation(async () =>
        makeS3BodyFrom({ id: "x", status: "completed", words: [] }),
      );
      mockPrismaVideoUpdate.mockResolvedValue({});
      const ctx = buildMockCtx();

      await processGenerateJob(makeMockJob("vid_no_text"), ctx as never);

      expect(mockPrismaVideoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "FAILED",
            failureReason: expect.stringContaining(
              "[GEN_TRANSCRIPT_PARSE_ERROR]",
            ),
          }),
        }),
      );
    });
  });

  describe("happy path", () => {
    it("persists chaptersJson + flips to READY_FOR_REVIEW", async () => {
      mockPrismaVideoFindUnique.mockResolvedValue({
        userId: "user-1",
        transcriptS3Key: "videos/vid_happy/transcript.json",
        chaptersJson: null,
        status: "GENERATING",
      });
      mockPrismaVideoUpdate.mockResolvedValue({});
      const ctx = buildMockCtx();

      await processGenerateJob(makeMockJob("vid_happy"), ctx as never);

      // The READY_FOR_REVIEW update carries the chaptersJson payload.
      expect(mockPrismaVideoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "vid_happy" },
          data: expect.objectContaining({
            status: "READY_FOR_REVIEW",
            failureReason: null,
            chaptersJson: {
              summary: "Generated summary of the video.",
              chapters: [
                { startMs: 0, title: "Intro" },
                { startMs: 12_000, title: "Main" },
                { startMs: 24_000, title: "Wrap" },
              ],
            },
          }),
        }),
      );

      // SSE STATUS_UPDATE for READY_FOR_REVIEW was published.
      const statusUpdates = mockEventsPublish.mock.calls
        .map(([evt]) => evt)
        .filter((evt) => evt.type === "STATUS_UPDATE");
      expect(statusUpdates).toContainEqual(
        expect.objectContaining({
          status: "READY_FOR_REVIEW",
          videoId: "vid_happy",
        }),
      );
    });

    it("flips status to GENERATING first if the row was still TRANSCRIBING", async () => {
      mockPrismaVideoFindUnique.mockResolvedValue({
        userId: "user-1",
        transcriptS3Key: "videos/vid_x/transcript.json",
        chaptersJson: null,
        status: "TRANSCRIBING",
      });
      mockPrismaVideoUpdate.mockResolvedValue({});
      const ctx = buildMockCtx();

      await processGenerateJob(makeMockJob("vid_x"), ctx as never);

      // Two updates: first GENERATING, then READY_FOR_REVIEW.
      const updateStatuses = mockPrismaVideoUpdate.mock.calls.map(
        ([args]) => args.data?.status,
      );
      expect(updateStatuses).toEqual(["GENERATING", "READY_FOR_REVIEW"]);
    });

    it("skips the GENERATING flip when the row already is GENERATING", async () => {
      mockPrismaVideoFindUnique.mockResolvedValue({
        userId: "user-1",
        transcriptS3Key: "videos/vid_x/transcript.json",
        chaptersJson: null,
        status: "GENERATING",
      });
      mockPrismaVideoUpdate.mockResolvedValue({});
      const ctx = buildMockCtx();

      await processGenerateJob(makeMockJob("vid_x"), ctx as never);

      // Only one update: the READY_FOR_REVIEW at the end.
      expect(mockPrismaVideoUpdate).toHaveBeenCalledTimes(1);
      expect(mockPrismaVideoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "READY_FOR_REVIEW" }),
        }),
      );
    });
  });

  describe("error handling", () => {
    it("marks FAILED with [LLM_AUTH] when classify says permanent LLM_AUTH", async () => {
      mockPrismaVideoFindUnique.mockResolvedValue({
        userId: "user-1",
        transcriptS3Key: "videos/vid_x/transcript.json",
        chaptersJson: null,
        status: "GENERATING",
      });
      mockValidateWithRetry.mockRejectedValue(new Error("401 bad key"));
      mockLlmClassify.mockReturnValueOnce({
        kind: "permanent",
        reasonCode: "LLM_AUTH",
        message: "LLM provider rejected the API key.",
      });
      mockPrismaVideoUpdate.mockResolvedValue({});
      const ctx = buildMockCtx();

      await processGenerateJob(makeMockJob("vid_x"), ctx as never);

      expect(mockPrismaVideoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "FAILED",
            failureReason: expect.stringContaining("[LLM_AUTH]"),
          }),
        }),
      );
      // Should NOT throw — permanent failures are handled inline.
    });

    it("marks FAILED with [LLM_BAD_OUTPUT] after retries exhaust", async () => {
      mockPrismaVideoFindUnique.mockResolvedValue({
        userId: "user-1",
        transcriptS3Key: "videos/vid_x/transcript.json",
        chaptersJson: null,
        status: "GENERATING",
      });
      mockValidateWithRetry.mockRejectedValue(
        new Error("[LLM_BAD_OUTPUT] LLM response failed validation after 3 attempts."),
      );
      mockLlmClassify.mockReturnValueOnce({
        kind: "permanent",
        reasonCode: "LLM_BAD_OUTPUT",
        message: "LLM response was not valid JSON.",
      });
      mockPrismaVideoUpdate.mockResolvedValue({});
      const ctx = buildMockCtx();

      await processGenerateJob(makeMockJob("vid_x"), ctx as never);

      expect(mockPrismaVideoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "FAILED",
            failureReason: expect.stringContaining("[LLM_BAD_OUTPUT]"),
          }),
        }),
      );
    });

    it("rethrows on transient LLM errors so BullMQ retries", async () => {
      mockPrismaVideoFindUnique.mockResolvedValue({
        userId: "user-1",
        transcriptS3Key: "videos/vid_x/transcript.json",
        chaptersJson: null,
        status: "GENERATING",
      });
      mockValidateWithRetry.mockRejectedValue(new Error("503 service unavailable"));
      mockLlmClassify.mockReturnValueOnce({
        kind: "transient",
        reasonCode: "LLM_UPSTREAM",
        message: "LLM provider returned 503.",
      });
      mockPrismaVideoUpdate.mockResolvedValue({});
      const ctx = buildMockCtx();

      await expect(
        processGenerateJob(makeMockJob("vid_x"), ctx as never),
      ).rejects.toThrow(/\[LLM_UPSTREAM\]/);

      // The DB row is NOT marked FAILED on transient — BullMQ's failed
      // listener does that after retries exhaust.
      const failedUpdates = mockPrismaVideoUpdate.mock.calls.filter(
        ([args]) => args.data?.status === "FAILED",
      );
      expect(failedUpdates).toHaveLength(0);
    });
  });

  describe("missing LLM key", () => {
    it("marks FAILED with [LLM_AUTH] when NVIDIA_API_KEY is unset", async () => {
      mockPrismaVideoFindUnique.mockResolvedValue({
        userId: "user-1",
        transcriptS3Key: "videos/vid_x/transcript.json",
        chaptersJson: null,
        status: "GENERATING",
      });
      // The constructor throws when the key is missing; classify
      // surfaces that as a permanent [LLM_AUTH].
      mockValidateWithRetry.mockImplementation(async () => {
        throw new Error("[LLM_AUTH] NVIDIA_API_KEY is not configured.");
      });
      mockLlmClassify.mockReturnValueOnce({
        kind: "permanent",
        reasonCode: "LLM_AUTH",
        message: "NVIDIA_API_KEY is not configured.",
      });
      mockPrismaVideoUpdate.mockResolvedValue({});
      const ctx = buildMockCtx({ NVIDIA_API_KEY: undefined });

      await processGenerateJob(makeMockJob("vid_no_key"), ctx as never);

      expect(mockPrismaVideoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "FAILED",
            failureReason: expect.stringContaining("[LLM_AUTH]"),
          }),
        }),
      );
    });
  });
});

afterAll(() => {
  if (existsSync(audioTempDir)) {
    rmSync(audioTempDir, { recursive: true, force: true });
  }
});