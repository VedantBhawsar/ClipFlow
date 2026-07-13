/**
 * Unit tests for the `transcription` BullMQ job.
 *
 * Strategy: mock all of Prisma, the S3 module, and the AssemblyAI
 * wrapper. The job's job is to:
 *   - guard against missing rows / missing audio / missing API key,
 *   - persist transcript JSON to S3,
 *   - flip the row to GENERATING with the right fields.
 *
 * We do NOT exercise the AssemblyAI SDK's actual HTTP behavior — the
 * `assemblyai.test.ts` and `assemblyai-errors.test.ts` suites already
 * cover that layer in isolation. Here we treat the wrapper as a black
 * box that either resolves to an `AaiTranscript` or throws.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import type { Job } from "bullmq";
import type { Env } from "@clipflow/config";
import {
  processTranscriptionJob,
  type TranscriptionJobData,
} from "./transcription.js";

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
  mockPutObjectFromFile,
  mockTranscribeAudioFile,
  mockEventsPublish,
} = vi.hoisted(() => ({
  mockPrismaVideoFindUnique: vi.fn(),
  mockPrismaVideoUpdate: vi.fn(),
  mockGetObjectStream: vi.fn(),
  mockPutObjectFromFile: vi.fn(),
  mockTranscribeAudioFile: vi.fn(),
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
  buildS3Config: vi.fn().mockReturnValue({ bucket: "test-bucket", region: "us-east-1" }),
  getS3Client: vi.fn().mockReturnValue({}),
  getObjectStream: mockGetObjectStream,
  putObjectFromFile: mockPutObjectFromFile,
}));

vi.mock("../lib/transcription/assemblyai.js", () => ({
  transcribeAudioFile: mockTranscribeAudioFile,
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
): Job<TranscriptionJobData> =>
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
    RATE_LIMIT_WINDOW_MS: 900000,
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
    LLM_PROVIDER: "claude",
    ANTHROPIC_API_KEY: undefined,
    OPENAI_API_KEY: undefined,
    NVIDIA_API_KEY: undefined,
    NVIDIA_BASE_URL: "https://integrate.api.nvidia.com/v1",
    LLM_MODEL: "claude-3-5-haiku-latest",
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
 * Build a minimal AaiTranscript fixture. Fields that aren't relevant
 * to the test can be omitted; we only need what the job reads.
 */
const buildTranscript = (overrides: Record<string, unknown> = {}) => ({
  id: "aai-123",
  status: "completed" as const,
  text: "hello world",
  words: [
    { text: "hello", startMs: 0, endMs: 500, confidence: 0.99 },
    { text: "world", startMs: 500, endMs: 1000, confidence: 0.98 },
  ],
  chapters: [
    {
      startMs: 0,
      endMs: 5000,
      gist: "intro",
      headline: "Introduction",
      summary: "The host says hello.",
    },
  ],
  languageCode: "en",
  durationMs: 5000,
  ...overrides,
});

const audioTempDir = mkdtempSync(join(tmpdir(), "clipflow-transcribe-test-"));

describe("processTranscriptionJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default S3: a tiny dummy audio file the job can stream into temp.
    const audioPath = join(audioTempDir, "audio.mp3");
    writeFileSync(audioPath, Buffer.from([0xff, 0xfb, 0x90, 0x00]));
    mockGetObjectStream.mockResolvedValue({
      body: {
        transformToWebStream: () => {
          // Minimal in-memory ReadableStream for the test pipeline.
          const data = readFileSync(audioPath);
          return new ReadableStream({
            start(controller) {
              controller.enqueue(data);
              controller.close();
            },
          });
        },
      },
      contentLength: data_length(audioPath),
    });
    mockPutObjectFromFile.mockResolvedValue({ sizeBytes: 1024 });
  });

  describe("guard rails", () => {
    it("skips when the video row is missing", async () => {
      mockPrismaVideoFindUnique.mockResolvedValue(null);
      const ctx = buildMockCtx();

      await processTranscriptionJob(makeMockJob("vid_missing"), ctx as never);

      expect(mockPrismaVideoUpdate).not.toHaveBeenCalled();
      expect(mockPutObjectFromFile).not.toHaveBeenCalled();
      expect(ctx.logger.warn).toHaveBeenCalledWith(
        { videoId: "vid_missing" },
        "Video row missing — skipping transcription",
      );
    });

    it("skips when the row already has a transcript (idempotent)", async () => {
      mockPrismaVideoFindUnique.mockResolvedValue({
        userId: "user-1",
        s3KeyAudio: "videos/vid_x/audio.mp3",
        transcriptS3Key: "videos/vid_x/transcript.json",
        status: "GENERATING",
      });
      const ctx = buildMockCtx();

      await processTranscriptionJob(makeMockJob("vid_x"), ctx as never);

      expect(mockPrismaVideoUpdate).not.toHaveBeenCalled();
      expect(mockTranscribeAudioFile).not.toHaveBeenCalled();
      expect(ctx.logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ transcriptS3Key: "videos/vid_x/transcript.json" }),
        "Video already has a transcript — skipping (idempotent)",
      );
    });

    it("marks FAILED with [AAI_AUDIO_MISSING] when s3KeyAudio is null", async () => {
      mockPrismaVideoFindUnique.mockResolvedValue({
        userId: "user-1",
        s3KeyAudio: null,
        transcriptS3Key: null,
        status: "UPLOADED",
      });
      mockPrismaVideoUpdate.mockResolvedValue({});
      const ctx = buildMockCtx();

      await processTranscriptionJob(makeMockJob("vid_no_audio"), ctx as never);

      expect(mockPrismaVideoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "vid_no_audio" },
          data: expect.objectContaining({
            status: "FAILED",
            failureReason: expect.stringContaining("[AAI_AUDIO_MISSING]"),
          }),
        }),
      );
      // SSE: STATUS_UPDATE + ERROR
      const errorEvents = mockEventsPublish.mock.calls.filter(
        ([evt]) => evt.type === "ERROR",
      );
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0]![0].error).toMatch(/\[AAI_AUDIO_MISSING\]/);
    });

    it("marks FAILED with [AAI_AUTH] when ASSEMBLYAI_API_KEY is unset", async () => {
      mockPrismaVideoFindUnique.mockResolvedValue({
        userId: "user-1",
        s3KeyAudio: "videos/vid_x/audio.mp3",
        transcriptS3Key: null,
        status: "UPLOADED",
      });
      mockPrismaVideoUpdate.mockResolvedValue({});
      const ctx = buildMockCtx({ ASSEMBLYAI_API_KEY: undefined });

      await processTranscriptionJob(makeMockJob("vid_no_key"), ctx as never);

      expect(mockPrismaVideoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "FAILED",
            failureReason: expect.stringContaining("[AAI_AUTH]"),
          }),
        }),
      );
      expect(mockTranscribeAudioFile).not.toHaveBeenCalled();
    });
  });

  describe("happy path", () => {
    it("transcribes, uploads transcript + chapters, and flips to GENERATING", async () => {
      mockPrismaVideoFindUnique.mockResolvedValue({
        userId: "user-1",
        s3KeyAudio: "videos/vid_happy/audio.mp3",
        transcriptS3Key: null,
        status: "TRANSCRIBING",
      });
      mockPrismaVideoUpdate.mockResolvedValue({});
      mockTranscribeAudioFile.mockResolvedValue(buildTranscript());
      const ctx = buildMockCtx();

      await processTranscriptionJob(makeMockJob("vid_happy"), ctx as never);

      // Row was flipped to GENERATING with all three transcript fields.
      expect(mockPrismaVideoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "vid_happy" },
          data: expect.objectContaining({
            transcriptS3Key: "videos/vid_happy/transcript.json",
            transcriptLanguage: "en",
            transcriptDurationMs: 5000,
            status: "GENERATING",
          }),
        }),
      );

      // Both transcript + chapters files uploaded.
      const uploadKeys = mockPutObjectFromFile.mock.calls.map(
        ([, , key]) => key,
      );
      expect(uploadKeys).toContain("videos/vid_happy/transcript.json");
      expect(uploadKeys).toContain("videos/vid_happy/chapters.auto.json");

      // SSE STATUS_UPDATE for GENERATING was published.
      const statusUpdates = mockEventsPublish.mock.calls
        .map(([evt]) => evt)
        .filter((evt) => evt.type === "STATUS_UPDATE");
      expect(statusUpdates).toContainEqual(
        expect.objectContaining({ status: "GENERATING", videoId: "vid_happy" }),
      );
    });
  });

  describe("error handling", () => {
    it("marks FAILED with [AAI_QUOTA] on quota errors (permanent)", async () => {
      mockPrismaVideoFindUnique.mockResolvedValue({
        userId: "user-1",
        s3KeyAudio: "videos/vid_quota/audio.mp3",
        transcriptS3Key: null,
        status: "TRANSCRIBING",
      });
      mockPrismaVideoUpdate.mockResolvedValue({});
      mockTranscribeAudioFile.mockRejectedValue(
        new Error("HTTP 429: quota exceeded"),
      );
      const ctx = buildMockCtx();

      await processTranscriptionJob(makeMockJob("vid_quota"), ctx as never);

      expect(mockPrismaVideoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "FAILED",
            failureReason: expect.stringMatching(/^\[AAI_QUOTA\]/),
          }),
        }),
      );
      expect(ctx.logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ reasonCode: "AAI_QUOTA" }),
        "Transcription failed permanently; not retrying",
      );
    });

    it("rethrows on transient errors (e.g. 5xx upstream)", async () => {
      mockPrismaVideoFindUnique.mockResolvedValue({
        userId: "user-1",
        s3KeyAudio: "videos/vid_5xx/audio.mp3",
        transcriptS3Key: null,
        status: "TRANSCRIBING",
      });
      mockPrismaVideoUpdate.mockResolvedValue({});
      mockTranscribeAudioFile.mockRejectedValue(
        new Error("HTTP 503: service unavailable"),
      );
      const ctx = buildMockCtx();

      await expect(
        processTranscriptionJob(makeMockJob("vid_5xx"), ctx as never),
      ).rejects.toThrow(/AAI_UPSTREAM/);

      // The DB row is NOT marked FAILED on transient — that's the
      // BullMQ `failed` listener's job after retries exhaust.
      const failedUpdates = mockPrismaVideoUpdate.mock.calls.filter(
        ([, args]) => args.data?.status === "FAILED",
      );
      expect(failedUpdates).toHaveLength(0);
    });
  });
});

// ---- Internal helpers ----

/**
 * File-size helper that doesn't import `node:fs` at the top of the
 * file (to keep the imports narrow to the lib/ patterns we mock).
 */
function data_length(path: string): number {
  return readFileSync(path).length;
}

// Best-effort cleanup of the temp dir on test teardown. Test runner
// recycles the tempdir on the next run, so a leftover here is
// harmless, but cleaning is cheap.
afterAll(() => {
  if (existsSync(audioTempDir)) {
    rmSync(audioTempDir, { recursive: true, force: true });
  }
});
