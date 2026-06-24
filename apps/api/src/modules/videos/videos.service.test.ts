/**
 * Tests for the videos service.
 *
 * Focus: the v1.1 fix that defers `Video` row creation until the S3
 * upload is confirmed. The old behavior minted a row at create time,
 * which surfaced "UPLOADED" rows for abandoned uploads. The new flow
 * mints a `pendingUploadId` + presigned URL only, and `finalizeUpload`
 * is the sole path that writes a `Video` row.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as videosService from "./videos.service.js";

vi.mock("@clipflow/s3", () => ({
  buildS3Config: vi.fn().mockReturnValue({
    region: "us-east-1",
    bucket: "test-bucket",
    endpoint: "http://localhost:9000",
    accessKeyId: "test-key",
    secretAccessKey: "test-secret",
    forcePathStyle: true,
  }),
  getS3Client: vi.fn().mockReturnValue({ send: vi.fn() }),
  createPresignedPostUrl: vi.fn().mockResolvedValue({
    postUrl: "https://s3.test/bucket/key",
    fields: { key: "videos/u/pending/pu_x/original.mp4", "Content-Type": "video/mp4" },
    contentLengthMaxBytes: 5 * 1024 * 1024 * 1024,
  }),
  headObject: vi.fn(),
  deleteObject: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    youTubeChannel: {
      findUnique: vi.fn(),
    },
    video: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("../../lib/db-guard.js", () => ({
  requireDatabase: vi.fn(),
}));

vi.mock("../../lib/cache.js", () => ({
  cache: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock("../../lib/queue.js", () => ({
  enqueuePublishJob: vi.fn().mockResolvedValue("job-1"),
}));

vi.mock("@clipflow/youtube-upload", () => ({
  publishVideo: vi.fn(),
}));

vi.mock("../../lib/logger.js", () => ({
  buildLogger: vi.fn(),
}));

import { prisma } from "../../lib/prisma.js";
import { cache } from "../../lib/cache.js";
import { headObject, deleteObject, createPresignedPostUrl } from "@clipflow/s3";
import { enqueuePublishJob } from "../../lib/queue.js";

const mockFindChannel = vi.mocked(prisma.youTubeChannel.findUnique);
const mockVideoCreate = vi.mocked(prisma.video.create);
const mockVideoUpdate = vi.mocked(prisma.video.update);
const mockCacheGet = vi.mocked(cache.get);
const mockCacheSet = vi.mocked(cache.set);
const mockCacheDel = vi.mocked(cache.del);
const mockHead = vi.mocked(headObject);
const mockDeleteObject = vi.mocked(deleteObject);
const mockPresign = vi.mocked(createPresignedPostUrl);
const mockEnqueue = vi.mocked(enqueuePublishJob);

const baseEnv = {
  YOUTUBE_MAX_VIDEO_BYTES: 5 * 1024 * 1024 * 1024,
  YOUTUBE_PRESIGNED_POST_TTL: 900,
} as never;

const baseInput = {
  title: "My video",
  description: "desc",
  tags: ["a", "b"],
  categoryId: "22",
  privacyStatus: "private" as const,
  originalFilename: "clip.mp4",
  contentType: "video/mp4",
  fileSizeBytes: 1024,
};

const baseChannel = {
  id: "channel-1",
  userId: "user-1",
  youtubeChannelId: "UC_test",
  channelTitle: "Test",
  channelThumbnailUrl: null,
  refreshTokenEncrypted: "enc",
  scopes: "youtube.upload",
  status: "CONNECTED" as const,
  lastVerifiedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const basePending = {
  userId: "user-1",
  channelId: "channel-1",
  s3KeyOriginal: "videos/user-1/pending/pu_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/original.mp4",
  contentType: "video/mp4",
  fileSizeBytes: 1024,
  metadata: {
    title: "My video",
    description: "desc",
    tags: ["a", "b"],
    categoryId: "22",
    privacyStatus: "private",
    originalFilename: "clip.mp4",
    scheduledPublishAt: null,
  },
};

/**
 * Stub row returned by `prisma.video.create` after a successful
 * `finalizeUpload`. The shape covers the fields the service reads
 * back off the created row (`scheduledPublishAt`) and the updated
 * row (`status`). The mock typing is widened to `any` so we can
 * spread it freely without tripping Prisma's deep thenable typing.
 */
type StubVideo = {
  id: string;
  userId: string;
  youtubeChannelId: string;
  title: string;
  description: string | null;
  tags: string[];
  categoryId: string;
  privacyStatus: string;
  originalFilename: string;
  fileSizeBytes: bigint;
  contentType: string;
  s3KeyOriginal: string;
  status: "UPLOADED" | "READY" | "SCHEDULED" | "PUBLISHING" | "PUBLISHED" | "PUBLISH_FAILED";
  failureReason: string | null;
  scheduledPublishAt: Date | null;
  youtubeVideoId: string | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
};

const stubCreatedVideo: StubVideo = {
  id: "vid_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  userId: "user-1",
  youtubeChannelId: "channel-1",
  title: "My video",
  description: "desc",
  tags: ["a", "b"],
  categoryId: "22",
  privacyStatus: "private",
  originalFilename: "clip.mp4",
  fileSizeBytes: BigInt(1024),
  contentType: "video/mp4",
  s3KeyOriginal: basePending.s3KeyOriginal,
  status: "UPLOADED",
  failureReason: null,
  scheduledPublishAt: null,
  youtubeVideoId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  publishedAt: null,
};

describe("videos.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createVideo", () => {
    it("does not create a Video row, only writes to cache and returns a presigned URL", async () => {
      mockFindChannel.mockResolvedValue(baseChannel);

      const result = await videosService.createVideo("user-1", baseInput, baseEnv);

      expect(mockVideoCreate).not.toHaveBeenCalled();
      expect(mockPresign).toHaveBeenCalledTimes(1);
      expect(mockCacheSet).toHaveBeenCalledTimes(1);
      const [cacheKey, cacheValue, ttl] = mockCacheSet.mock.calls[0]!;
      expect(cacheKey).toMatch(/^pendingUpload:pu_[0-9a-f-]{36}$/);
      expect(ttl).toBe(900);
      const parsed = JSON.parse(cacheValue);
      expect(parsed).toMatchObject({
        userId: "user-1",
        channelId: baseChannel.id,
        contentType: "video/mp4",
        fileSizeBytes: 1024,
        metadata: { title: "My video", tags: ["a", "b"] },
      });
      // s3KeyOriginal lives under the pending/ prefix.
      expect(parsed.s3KeyOriginal).toMatch(/^videos\/user-1\/pending\/pu_/);
      expect(result.pendingUploadId).toMatch(/^pu_/);
      expect(result.postUrl).toBe("https://s3.test/bucket/key");
    });

    it("throws YOUTUBE_NOT_CONNECTED when no channel exists", async () => {
      mockFindChannel.mockResolvedValue(null);

      await expect(
        videosService.createVideo("user-1", baseInput, baseEnv),
      ).rejects.toMatchObject({ statusCode: 412, code: "YOUTUBE_NOT_CONNECTED" });
      expect(mockVideoCreate).not.toHaveBeenCalled();
      expect(mockCacheSet).not.toHaveBeenCalled();
    });

    it("throws YOUTUBE_NEEDS_REAUTH when channel is in NEEDS_REAUTH", async () => {
      mockFindChannel.mockResolvedValue({ ...baseChannel, status: "NEEDS_REAUTH" });

      await expect(
        videosService.createVideo("user-1", baseInput, baseEnv),
      ).rejects.toMatchObject({ statusCode: 412, code: "YOUTUBE_NEEDS_REAUTH" });
    });
  });

  describe("getUploadUrl", () => {
    it("returns a fresh presigned POST URL from the cache entry's key", async () => {
      mockCacheGet.mockResolvedValue(JSON.stringify(basePending));

      const result = await videosService.getUploadUrl("user-1", "pu_xxx", baseEnv);

      expect(result.postUrl).toBe("https://s3.test/bucket/key");
      expect(mockPresign).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ key: basePending.s3KeyOriginal }),
      );
    });

    it("returns 404 when the cache entry is missing", async () => {
      mockCacheGet.mockResolvedValue(null);
      await expect(
        videosService.getUploadUrl("user-1", "pu_xxx", baseEnv),
      ).rejects.toMatchObject({ statusCode: 404, code: "UPLOAD_NOT_FOUND" });
    });

    it("returns 404 when the cache entry belongs to a different user", async () => {
      mockCacheGet.mockResolvedValue(JSON.stringify({ ...basePending, userId: "someone-else" }));
      await expect(
        videosService.getUploadUrl("user-1", "pu_xxx", baseEnv),
      ).rejects.toMatchObject({ statusCode: 404, code: "UPLOAD_NOT_FOUND" });
    });
  });

  describe("finalizeUpload", () => {
    it("happy path: cache hit + S3 HEAD success + row created + enqueue", async () => {
      mockCacheGet.mockResolvedValue(JSON.stringify(basePending));
      mockHead.mockResolvedValue({
        contentLength: 1024,
        contentType: "video/mp4",
        etag: "etag",
      });
      mockVideoCreate.mockResolvedValue(stubCreatedVideo);
      mockVideoUpdate.mockResolvedValue({ ...stubCreatedVideo, status: "READY" });

      const result = await videosService.finalizeUpload("user-1", "pu_xxx", baseEnv);

      expect(mockVideoCreate).toHaveBeenCalledTimes(1);
      expect(mockVideoUpdate).toHaveBeenCalledTimes(1);
      expect(mockEnqueue).toHaveBeenCalledTimes(1);
      expect(mockCacheDel).toHaveBeenCalledWith("pendingUpload:pu_xxx");
      expect(result.status).toBe("READY");
    });

    it("returns 404 when the cache entry is missing", async () => {
      mockCacheGet.mockResolvedValue(null);
      await expect(
        videosService.finalizeUpload("user-1", "pu_xxx", baseEnv),
      ).rejects.toMatchObject({ statusCode: 404, code: "UPLOAD_NOT_FOUND" });
      expect(mockVideoCreate).not.toHaveBeenCalled();
    });

    it("returns 404 + cleans cache when S3 has no object", async () => {
      mockCacheGet.mockResolvedValue(JSON.stringify(basePending));
      mockHead.mockResolvedValue(null);

      await expect(
        videosService.finalizeUpload("user-1", "pu_xxx", baseEnv),
      ).rejects.toMatchObject({ statusCode: 404, code: "UPLOAD_NOT_FOUND" });
      expect(mockCacheDel).toHaveBeenCalledWith("pendingUpload:pu_xxx");
      expect(mockVideoCreate).not.toHaveBeenCalled();
    });

    it("returns UPLOAD_INCOMPLETE + cleans S3 + cache when size mismatches", async () => {
      mockCacheGet.mockResolvedValue(JSON.stringify(basePending));
      // Browser declared 1024 but only 512 landed → partial PUT.
      mockHead.mockResolvedValue({
        contentLength: 512,
        contentType: "video/mp4",
        etag: "etag",
      });

      await expect(
        videosService.finalizeUpload("user-1", "pu_xxx", baseEnv),
      ).rejects.toMatchObject({ statusCode: 400, code: "UPLOAD_INCOMPLETE" });
      expect(mockDeleteObject).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        basePending.s3KeyOriginal,
      );
      expect(mockCacheDel).toHaveBeenCalledWith("pendingUpload:pu_xxx");
      expect(mockVideoCreate).not.toHaveBeenCalled();
    });

    it("returns 404 when the cache entry belongs to a different user", async () => {
      mockCacheGet.mockResolvedValue(JSON.stringify({ ...basePending, userId: "someone-else" }));
      await expect(
        videosService.finalizeUpload("user-1", "pu_xxx", baseEnv),
      ).rejects.toMatchObject({ statusCode: 404, code: "UPLOAD_NOT_FOUND" });
      expect(mockVideoCreate).not.toHaveBeenCalled();
    });

    it("transitions to SCHEDULED (not READY) and does not enqueue when scheduledPublishAt is in the future", async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000);
      const futureIso = futureDate.toISOString();
      mockCacheGet.mockResolvedValue(
        JSON.stringify({
          ...basePending,
          metadata: { ...basePending.metadata, scheduledPublishAt: futureIso },
        }),
      );
      mockHead.mockResolvedValue({ contentLength: 1024, contentType: "video/mp4", etag: "e" });
      // The service reads `scheduledPublishAt` off the row Prisma returns
      // (it's the row that's updated, not the cache). Stub a row whose
      // `scheduledPublishAt` is in the future so the service picks the
      // SCHEDULED branch.
      mockVideoCreate.mockResolvedValue({
        ...stubCreatedVideo,
        scheduledPublishAt: futureDate,
      } as never);
      mockVideoUpdate.mockResolvedValue({ ...stubCreatedVideo, status: "SCHEDULED" } as never);

      const result = await videosService.finalizeUpload("user-1", "pu_xxx", baseEnv);
      expect(result.status).toBe("SCHEDULED");
      expect(mockEnqueue).not.toHaveBeenCalled();
    });
  });

  describe("cancelPendingUpload", () => {
    it("deletes the S3 object and the cache entry on success", async () => {
      mockCacheGet.mockResolvedValue(JSON.stringify(basePending));
      await videosService.cancelPendingUpload("user-1", "pu_xxx", baseEnv);
      expect(mockDeleteObject).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        basePending.s3KeyOriginal,
      );
      expect(mockCacheDel).toHaveBeenCalledWith("pendingUpload:pu_xxx");
    });

    it("is a no-op when the cache entry is missing (idempotent)", async () => {
      mockCacheGet.mockResolvedValue(null);
      await expect(
        videosService.cancelPendingUpload("user-1", "pu_xxx", baseEnv),
      ).resolves.toBeUndefined();
      expect(mockDeleteObject).not.toHaveBeenCalled();
      expect(mockCacheDel).not.toHaveBeenCalled();
    });

    it("does not reveal that the id exists for another user", async () => {
      mockCacheGet.mockResolvedValue(JSON.stringify({ ...basePending, userId: "someone-else" }));
      await videosService.cancelPendingUpload("user-1", "pu_xxx", baseEnv);
      expect(mockDeleteObject).not.toHaveBeenCalled();
      expect(mockCacheDel).not.toHaveBeenCalled();
    });

    it("cleans up a corrupt cache entry and exits cleanly", async () => {
      mockCacheGet.mockResolvedValue("not-json");
      await expect(
        videosService.cancelPendingUpload("user-1", "pu_xxx", baseEnv),
      ).resolves.toBeUndefined();
      expect(mockCacheDel).toHaveBeenCalledWith("pendingUpload:pu_xxx");
    });
  });
});
