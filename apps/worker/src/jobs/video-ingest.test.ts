/**
 * Integration test for the video-ingest BullMQ job.
 *
 * Uses a real (tiny) MP4 generated via FFmpeg, mocks the S3 client,
 * and asserts the full row-update + S3-upload + SSE-event flow.
 *
 * Skipped locally because it requires the FFmpeg binary to be installed.
 * Enable with: change `it.skip` → `it` once `ffmpeg` / `ffprobe` are
 * available in the CI environment.
 */
import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import type { Job } from "bullmq";
import { processVideoIngestJob, type VideoIngestJobData } from "./video-ingest.js";

// ---- Mock helpers ----
const mockPrismaVideoUpdate = vi.fn();
const mockPrismaVideoFindUnique = vi.fn();
const mockPutObjectFromFile = vi.fn();
const mockGetObjectStream = vi.fn();
const mockEventsPublish = vi.fn().mockResolvedValue(undefined);

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

vi.mock("../lib/events.js", () => ({
  WorkerEventPublisher: class {
    publish = mockEventsPublish;
  },
}));

const mockJob = (videoId: string, attemptsMade = 0): Job<VideoIngestJobData> =>
  ({
    id: `job-${videoId}`,
    data: { videoId },
    attemptsMade,
  }) as never;

const mockCtx = {
  env: { FFMPEG_PATH: "ffmpeg" } as never,
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  events: {
    publish: mockEventsPublish,
  },
};

describe("processVideoIngestJob", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "clipflow-ingest-test-"));

  // Generate a tiny valid MP4: 2-second, 320×240, with a sine tone.
  // Writes to tempDir so the test is self-contained.
  const sampleMp4Path = join(tempDir, "sample.mp4");
  beforeAll(() => {
    const result = spawnSync("ffmpeg", [
      "-y",
      "-f", "lavfi",
      "-i", "testsrc=duration=2:size=320x240:rate=30",
      "-f", "lavfi",
      "-i", "sine=frequency=440:duration=2",
      "-c:v", "libx264",
      "-c:a", "aac",
      "-shortest",
      sampleMp4Path,
    ]);
    if (result.status !== 0) {
      throw new Error(`FFmpeg not available or failed: ${result.stderr?.toString()}`);
    }
  });

  afterAll(() => {
    // Clean up generated file
    try {
      const { unlinkSync } = require("node:fs");
      unlinkSync(sampleMp4Path);
    } catch {
      // ignore
    }
  });

  it.skip("full flow: UPLOADED → EXTRACTING → TRANSCRIBING, audio + frames uploaded to S3", async () => {
    const videoId = "vid_test-ingest-full";

    // Row: UPLOADED, no s3KeyAudio yet
    mockPrismaVideoFindUnique.mockResolvedValue({
      id: videoId,
      userId: "user-1",
      s3KeyOriginal: "uploads/test.mp4",
      s3KeyAudio: null,
      status: "UPLOADED",
    });

    // Simulate S3 returning a readable stream from our sample file
    const { createReadStream } = require("node:fs");
    mockGetObjectStream.mockResolvedValue({
      body: createReadStream(sampleMp4Path),
      contentLength: 1024,
    });

    mockPrismaVideoUpdate.mockResolvedValue({
      id: videoId,
      status: "TRANSCRIBING",
      s3KeyAudio: `videos/${videoId}/audio.mp3`,
      s3KeyFramesPrefix: `videos/${videoId}/frames/`,
      frameCount: 1,
      durationSeconds: 2,
    });

    const job = mockJob(videoId);
    await processVideoIngestJob(job, mockCtx as never);

    // verify row was updated to TRANSCRIBING with all s3 keys set
    expect(mockPrismaVideoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: videoId },
        data: expect.objectContaining({
          status: "TRANSCRIBING",
          s3KeyAudio: expect.stringContaining("audio.mp3"),
          frameCount: expect.any(Number),
          durationSeconds: expect.any(Number),
        }),
      }),
    );

    // verify audio was uploaded
    expect(mockPutObjectFromFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.stringContaining("audio.mp3"),
      expect.any(String),
      "audio/mpeg",
    );

    // verify at least one frame was uploaded
    const frameCalls = mockPutObjectFromFile.mock.calls.filter(
      ([, , key]) => key.includes("frames/"),
    );
    expect(frameCalls.length).toBeGreaterThan(0);
    expect(frameCalls[0]![5]).toBe("image/jpeg");

    // verify SSE STATUS_UPDATE for TRANSCRIBING was published
    const statusUpdates = mockEventsPublish.mock.calls.filter(
      ([evt]) => evt.type === "STATUS_UPDATE",
    );
    expect(statusUpdates).toContainEqual(
      expect.objectContaining({ status: "TRANSCRIBING" }),
    );
  });

  it.skip("idempotency: skips when s3KeyAudio is already set", async () => {
    const videoId = "vid_test-ingest-idem";
    mockPrismaVideoFindUnique.mockResolvedValue({
      id: videoId,
      userId: "user-1",
      s3KeyOriginal: "uploads/test.mp4",
      s3KeyAudio: `videos/${videoId}/audio.mp3`, // already extracted
      status: "EXTRACTING",
    });

    const job = mockJob(videoId);
    await processVideoIngestJob(job, mockCtx as never);

    // Should NOT update the row or upload anything
    expect(mockPrismaVideoUpdate).not.toHaveBeenCalled();
    expect(mockPutObjectFromFile).not.toHaveBeenCalled();
  });

  it.skip("permanent failure: corrupt file → FAILED, no retry", async () => {
    const videoId = "vid_test-ingest-fail";
    mockPrismaVideoFindUnique.mockResolvedValue({
      id: videoId,
      userId: "user-1",
      s3KeyOriginal: "uploads/bad.mp4",
      s3KeyAudio: null,
      status: "UPLOADED",
    });

    // Return a corrupt file (not a real video)
    const { createReadStream } = require("node:fs");
    const corruptPath = join(tempDir, "corrupt.mp4");
    writeFileSync(corruptPath, "this is not a video file");
    mockGetObjectStream.mockResolvedValue({
      body: createReadStream(corruptPath),
      contentLength: 20,
    });

    mockPrismaVideoUpdate.mockResolvedValue({
      id: videoId,
      status: "FAILED",
    });

    const job = mockJob(videoId);
    await processVideoIngestJob(job, mockCtx as never);

    // Should have marked as FAILED (permanent error — no rethrow)
    expect(mockPrismaVideoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });
});
