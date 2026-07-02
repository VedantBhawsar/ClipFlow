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
import type { Prisma } from "@prisma/client";
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
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
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
  enqueueIngestJob: vi.fn().mockResolvedValue("ingest-job-1"),
}));

vi.mock("@clipflow/youtube-upload", () => ({
  publishVideo: vi.fn(),
  unpublishVideo: vi.fn(),
  // Re-exported by the package; the propagation test constructs one
  // and passes it through `unpublishVideo`. The class lives in
  // `@clipflow/youtube-upload` at runtime so the mock needs it too.
  PermanentPublishError: class PermanentPublishError extends Error {
    public readonly code = "PERMANENT_PUBLISH_ERROR" as const;
    public readonly reasonCode: string;
    public readonly httpStatus?: number;
    constructor(
      reasonCode: string,
      message: string,
      httpStatus?: number,
    ) {
      super(message);
      this.name = "PermanentPublishError";
      this.reasonCode = reasonCode;
      this.httpStatus = httpStatus;
    }
  },
  TransientPublishError: class TransientPublishError extends Error {
    public readonly code = "TRANSIENT_PUBLISH_ERROR" as const;
    public readonly httpStatus?: number;
    constructor(message: string, httpStatus?: number) {
      super(message);
      this.name = "TransientPublishError";
      this.httpStatus = httpStatus;
    }
  },
}));

vi.mock("../../lib/logger.js", () => ({
  buildLogger: vi.fn(),
}));

import { prisma } from "../../lib/prisma.js";
import { cache } from "../../lib/cache.js";
import { headObject, deleteObject, createPresignedPostUrl } from "@clipflow/s3";
import { enqueueIngestJob } from "../../lib/queue.js";
import { unpublishVideo as unpublishOnYouTube } from "@clipflow/youtube-upload";

const mockFindChannel = vi.mocked(prisma.youTubeChannel.findUnique);
const mockVideoCreate = vi.mocked(prisma.video.create);
const mockVideoUpdate = vi.mocked(prisma.video.update);
const mockVideoFindUnique = vi.mocked(prisma.video.findUnique);
const mockVideoFindUniqueOrThrow = vi.mocked(prisma.video.findUniqueOrThrow);
const mockVideoFindMany = vi.mocked(prisma.video.findMany);
const mockUnpublishOnYouTube = vi.mocked(unpublishOnYouTube);
const mockCacheGet = vi.mocked(cache.get);
const mockCacheSet = vi.mocked(cache.set);
const mockCacheDel = vi.mocked(cache.del);
const mockHead = vi.mocked(headObject);
const mockDeleteObject = vi.mocked(deleteObject);
const mockPresign = vi.mocked(createPresignedPostUrl);
const mockEnqueue = vi.mocked(enqueueIngestJob);

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
  madeForKids: false,
  ageRestriction: "none" as const,
  embeddable: true,
  license: "standard" as const,
  publicStatsViewable: true,
  commentPolicy: "allowAll" as const,
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
    madeForKids: false,
    ageRestriction: "none",
    embeddable: true,
    license: "standard",
    publicStatsViewable: true,
    commentPolicy: "allowAll",
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
  madeForKids: boolean;
  ageRestriction: string;
  embeddable: boolean;
  license: string;
  publicStatsViewable: boolean;
  commentPolicy: string;
  originalFilename: string;
  fileSizeBytes: bigint;
  contentType: string;
  s3KeyOriginal: string;
  s3KeyThumbnail: string | null;
  thumbnailContentType: string | null;
  s3KeyAudio: string | null;
  s3KeyFramesPrefix: string | null;
  frameCount: number | null;
  durationSeconds: number | null;
  /// Transcript + highlight artefacts added by the v1.5 pipeline slice.
  /// All nullable — populated by the `transcription` and `generate` workers
  /// (not yet built). Tests that don't exercise those stages leave them null.
  transcriptS3Key: string | null;
  transcriptLanguage: string | null;
  transcriptDurationMs: number | null;
  highlightsS3Prefix: string | null;
  highlightsCount: number | null;
  /// `chaptersJson` is Prisma's `Json?` type, which narrows to `Prisma.JsonValue | null`
  /// in the generated client. Tests pass `null` until the v1.5 generate worker lands.
  chaptersJson: Prisma.JsonValue | null;
  status: "UPLOADED" | "READY" | "EXTRACTING" | "TRANSCRIBING" | "GENERATING" | "READY_FOR_REVIEW" | "SCHEDULED" | "PUBLISHING" | "PUBLISHED" | "PUBLISH_FAILED" | "FAILED";
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
  madeForKids: false,
  ageRestriction: "none",
  embeddable: true,
  license: "standard",
  publicStatsViewable: true,
  commentPolicy: "allowAll",
  originalFilename: "clip.mp4",
  fileSizeBytes: BigInt(1024),
  contentType: "video/mp4",
  s3KeyOriginal: basePending.s3KeyOriginal,
  s3KeyThumbnail: null,
  thumbnailContentType: null,
  s3KeyAudio: null,
  s3KeyFramesPrefix: null,
  frameCount: null,
  durationSeconds: null,
  transcriptS3Key: null,
  transcriptLanguage: null,
  transcriptDurationMs: null,
  highlightsS3Prefix: null,
  highlightsCount: null,
  chaptersJson: null,
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
    it("happy path: cache hit + S3 HEAD success + row created + ingest enqueued", async () => {
      mockCacheGet.mockResolvedValue(JSON.stringify(basePending));
      mockHead.mockResolvedValue({
        contentLength: 1024,
        contentType: "video/mp4",
        etag: "etag",
      });
      mockVideoCreate.mockResolvedValue(stubCreatedVideo);
      mockVideoUpdate.mockResolvedValue({ ...stubCreatedVideo, status: "EXTRACTING" });

      const result = await videosService.finalizeUpload("user-1", "pu_xxx", baseEnv);

      expect(mockVideoCreate).toHaveBeenCalledTimes(1);
      expect(mockVideoUpdate).toHaveBeenCalledTimes(1);
      expect(mockVideoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "EXTRACTING" }) }),
      );
      expect(mockEnqueue).toHaveBeenCalledTimes(1);
      expect(mockEnqueue).toHaveBeenCalledWith(stubCreatedVideo.id, baseEnv);
      expect(mockCacheDel).toHaveBeenCalledWith("pendingUpload:pu_xxx");
      expect(result.status).toBe("EXTRACTING");
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

    it("always transitions to EXTRACTING and enqueues ingest, even when scheduledPublishAt is set", async () => {
      // scheduledPublishAt is preserved on the row for the post-generation
      // flow to consume — it does NOT short-circuit the EXTRACTING
      // transition anymore. The publish enqueue moves to the generation-complete hook.
      const futureDate = new Date(Date.now() + 60 * 60 * 1000);
      const futureIso = futureDate.toISOString();
      mockCacheGet.mockResolvedValue(
        JSON.stringify({
          ...basePending,
          metadata: { ...basePending.metadata, scheduledPublishAt: futureIso },
        }),
      );
      mockHead.mockResolvedValue({ contentLength: 1024, contentType: "video/mp4", etag: "e" });
      mockVideoCreate.mockResolvedValue({
        ...stubCreatedVideo,
        scheduledPublishAt: futureDate,
      } as never);
      mockVideoUpdate.mockResolvedValue({ ...stubCreatedVideo, status: "EXTRACTING" } as never);

      const result = await videosService.finalizeUpload("user-1", "pu_xxx", baseEnv);
      expect(result.status).toBe("EXTRACTING");
      expect(mockEnqueue).toHaveBeenCalledTimes(1);
      // And the scheduledPublishAt is preserved on the row.
      expect(mockVideoCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            scheduledPublishAt: futureDate,
            status: "UPLOADED",
          }),
        }),
      );
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

  describe("listVideos", () => {
    it("returns every committed video when no status filter is given", async () => {
      mockVideoFindMany.mockResolvedValue([stubCreatedVideo]);
      // The service signature requires a parsed query (page / pageSize
      // are guaranteed after the schema transform). Pass an explicit
      // defaults shape here so the call matches what the controller
      // would forward post-validation.
      const result = await videosService.listVideos("user-1", {
        page: 1,
        pageSize: 12,
      });
      expect(mockVideoFindMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        orderBy: { createdAt: "desc" },
        skip: 0,
        take: 12,
      });
      expect(result.videos).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(12);
    });

    it("filters by status when provided", async () => {
      mockVideoFindMany.mockResolvedValue([]);
      await videosService.listVideos("user-1", { status: "PUBLISHED", page: 1, pageSize: 12 });
      expect(mockVideoFindMany).toHaveBeenCalledWith({
        where: { userId: "user-1", status: "PUBLISHED" },
        orderBy: { createdAt: "desc" },
        skip: 0,
        take: 12,
      });
    });

    it("translates the NOT_PUBLISHED virtual status into a NOT filter", async () => {
      mockVideoFindMany.mockResolvedValue([]);
      await videosService.listVideos("user-1", {
        status: "NOT_PUBLISHED",
        page: 1,
        pageSize: 12,
      });
      expect(mockVideoFindMany).toHaveBeenCalledWith({
        where: { userId: "user-1", status: { not: "PUBLISHED" } },
        orderBy: { createdAt: "desc" },
        skip: 0,
        take: 12,
      });
    });

    it("adds an OR-based search across title/description/tags when q is given", async () => {
      mockVideoFindMany.mockResolvedValue([]);
      await videosService.listVideos("user-1", {
        q: "minecraft",
        page: 1,
        pageSize: 12,
      });
      expect(mockVideoFindMany).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          OR: [
            { title: { contains: "minecraft", mode: "insensitive" } },
            { description: { contains: "minecraft", mode: "insensitive" } },
            { tags: { has: "minecraft" } },
          ],
        },
        orderBy: { createdAt: "desc" },
        skip: 0,
        take: 12,
      });
    });

    it("computes skip from the page number", async () => {
      mockVideoFindMany.mockResolvedValue([]);
      await videosService.listVideos("user-1", { page: 3, pageSize: 20 });
      expect(mockVideoFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 40, take: 20 }),
      );
    });

    it("returns total + totalPages derived from the count query", async () => {
      mockVideoFindMany.mockResolvedValue([stubCreatedVideo]);
      // The mock for `count` is the second registered mock on prisma.video
      // (after findMany). Cast through unknown so the typed mock object
      // doesn't get in the way.
      (prisma.video as unknown as { count: ReturnType<typeof vi.fn> }).count = vi
        .fn()
        .mockResolvedValue(25);
      const result = await videosService.listVideos("user-1", {
        page: 1,
        pageSize: 12,
      });
      expect(result.total).toBe(25);
      expect(result.totalPages).toBe(3);
    });
  });

  describe("listPublishedVideos", () => {
    it("queries only PUBLISHED rows, newest publishedAt first", async () => {
      mockVideoFindMany.mockResolvedValue([]);
      (prisma.video as unknown as { count: ReturnType<typeof vi.fn> }).count = vi
        .fn()
        .mockResolvedValue(0);
      await videosService.listPublishedVideos("user-1", {
        page: 1,
        pageSize: 12,
      });
      expect(mockVideoFindMany).toHaveBeenCalledWith({
        where: { userId: "user-1", status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
        skip: 0,
        take: 12,
      });
    });

    it("threads q through to the search OR-clause", async () => {
      mockVideoFindMany.mockResolvedValue([]);
      (prisma.video as unknown as { count: ReturnType<typeof vi.fn> }).count = vi
        .fn()
        .mockResolvedValue(0);
      await videosService.listPublishedVideos("user-1", {
        q: "speedrun",
        page: 1,
        pageSize: 12,
      });
      expect(mockVideoFindMany).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          status: "PUBLISHED",
          OR: [
            { title: { contains: "speedrun", mode: "insensitive" } },
            { description: { contains: "speedrun", mode: "insensitive" } },
            { tags: { has: "speedrun" } },
          ],
        },
        orderBy: { publishedAt: "desc" },
        skip: 0,
        take: 12,
      });
    });
  });

  describe("unpublishVideo", () => {
    const publishedRow = {
      ...stubCreatedVideo,
      status: "PUBLISHED" as const,
      youtubeVideoId: "yt_abc123",
    };

    it("happy path: calls YouTube unpublish and re-reads the row", async () => {
      mockVideoFindUnique.mockResolvedValue(publishedRow);
      mockUnpublishOnYouTube.mockResolvedValue(undefined);
      mockVideoFindUniqueOrThrow.mockResolvedValue({
        ...publishedRow,
        privacyStatus: "private",
      });

      const result = await videosService.unpublishVideo(
        "user-1",
        publishedRow.id,
        baseEnv,
      );

      expect(mockUnpublishOnYouTube).toHaveBeenCalledTimes(1);
      expect(mockVideoFindUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: publishedRow.id },
      });
      expect(result.privacyStatus).toBe("private");
      expect(result.status).toBe("PUBLISHED");
    });

    it("returns 404 for an unknown video id", async () => {
      mockVideoFindUnique.mockResolvedValue(null);
      await expect(
        videosService.unpublishVideo("user-1", "vid_missing", baseEnv),
      ).rejects.toMatchObject({ statusCode: 404, code: "VIDEO_NOT_FOUND" });
      expect(mockUnpublishOnYouTube).not.toHaveBeenCalled();
    });

    it("returns 404 for a video owned by another user", async () => {
      mockVideoFindUnique.mockResolvedValue({ ...publishedRow, userId: "someone-else" });
      await expect(
        videosService.unpublishVideo("user-1", publishedRow.id, baseEnv),
      ).rejects.toMatchObject({ statusCode: 404, code: "VIDEO_NOT_FOUND" });
      expect(mockUnpublishOnYouTube).not.toHaveBeenCalled();
    });

    it("propagates VIDEO_NOT_PUBLISHED from the upload package", async () => {
      mockVideoFindUnique.mockResolvedValue({ ...publishedRow, status: "READY" });
      const { PermanentPublishError } = await import("@clipflow/youtube-upload");
      mockUnpublishOnYouTube.mockRejectedValue(
        new PermanentPublishError("VIDEO_NOT_PUBLISHED", "Video is READY, not PUBLISHED."),
      );
      await expect(
        videosService.unpublishVideo("user-1", publishedRow.id, baseEnv),
      ).rejects.toMatchObject({ reasonCode: "VIDEO_NOT_PUBLISHED" });
      expect(mockVideoFindUniqueOrThrow).not.toHaveBeenCalled();
    });
  });

  describe("updateVideo (PATCH /api/videos/:id)", () => {
    const reviewRow: StubVideo = {
      ...stubCreatedVideo,
      status: "READY_FOR_REVIEW",
      durationSeconds: 600,
      chaptersJson: {
        summary: "Original summary",
        chapters: [
          { startMs: 0, title: "Intro" },
          { startMs: 30_000, title: "Topic A" },
          { startMs: 60_000, title: "Outro" },
        ],
      } as unknown as Prisma.JsonValue,
    };

    beforeEach(() => {
      mockVideoFindUnique.mockResolvedValue(reviewRow);
      mockVideoUpdate.mockResolvedValue({
        ...reviewRow,
        // Return value of the update — slightly mutated by each test
        // via the spread in the test body.
      } as never);
    });

    it("rejects updates when status is not READY_FOR_REVIEW", async () => {
      mockVideoFindUnique.mockResolvedValue({
        ...reviewRow,
        status: "SCHEDULED",
      });
      await expect(
        videosService.updateVideo("user-1", reviewRow.id, { title: "x" }),
      ).rejects.toMatchObject({ code: "NOT_EDITABLE", statusCode: 409 });
      expect(mockVideoUpdate).not.toHaveBeenCalled();
    });

    it("rejects updates when the video belongs to another user", async () => {
      mockVideoFindUnique.mockResolvedValue({
        ...reviewRow,
        userId: "another-user",
      });
      await expect(
        videosService.updateVideo("user-1", reviewRow.id, { title: "x" }),
      ).rejects.toMatchObject({ code: "VIDEO_NOT_FOUND", statusCode: 404 });
      expect(mockVideoUpdate).not.toHaveBeenCalled();
    });

    it("rejects updates when the video doesn't exist", async () => {
      mockVideoFindUnique.mockResolvedValue(null);
      await expect(
        videosService.updateVideo("user-1", "missing", { title: "x" }),
      ).rejects.toMatchObject({ code: "VIDEO_NOT_FOUND", statusCode: 404 });
    });

    it("merges only the fields that were provided (partial update)", async () => {
      await videosService.updateVideo("user-1", reviewRow.id, {
        description: "New description",
      });
      expect(mockVideoUpdate).toHaveBeenCalledWith({
        where: { id: reviewRow.id },
        data: { description: "New description" },
      });
    });

    it("rewrites chaptersJson when summary OR chapters changes", async () => {
      await videosService.updateVideo("user-1", reviewRow.id, {
        summary: "Edited summary",
      });
      const call = mockVideoUpdate.mock.calls.at(-1)?.[0];
      expect(call?.data.chaptersJson).toMatchObject({
        summary: "Edited summary",
        chapters: expect.any(Array),
      });
      // The existing chapters list is preserved when only `summary` is sent —
      // otherwise a partial save would clobber the LLM counterpart.
      expect((call?.data.chaptersJson as { chapters: unknown[] }).chapters.length).toBe(3);
    });

    it("passes explicit null through for description-clearing", async () => {
      await videosService.updateVideo("user-1", reviewRow.id, {
        description: null,
      });
      expect(mockVideoUpdate).toHaveBeenCalledWith({
        where: { id: reviewRow.id },
        data: { description: null },
      });
    });
  });
});
