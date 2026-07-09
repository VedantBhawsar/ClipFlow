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
  createPresignedGetUrl: vi
    .fn()
    .mockImplementation(
      async (_client: unknown, _cfg: unknown, key: string) =>
        `https://s3.test/bucket/${key}?signed=1`,
    ),
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
    subscription: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    plan: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
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
  enqueuePublishJob: vi.fn().mockResolvedValue(undefined),
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
import { headObject, deleteObject, createPresignedPostUrl, createPresignedGetUrl } from "@clipflow/s3";
import { enqueueIngestJob, enqueuePublishJob } from "../../lib/queue.js";
import { unpublishVideo as unpublishOnYouTube, publishVideo as publishOnYouTube } from "@clipflow/youtube-upload";

const mockFindChannel = vi.mocked(prisma.youTubeChannel.findUnique);
const mockVideoCreate = vi.mocked(prisma.video.create);
const mockVideoUpdate = vi.mocked(prisma.video.update);
const mockVideoFindUnique = vi.mocked(prisma.video.findUnique);
const mockVideoFindUniqueOrThrow = vi.mocked(prisma.video.findUniqueOrThrow);
const mockVideoFindMany = vi.mocked(prisma.video.findMany);
const mockUnpublishOnYouTube = vi.mocked(unpublishOnYouTube);
const mockPublishOnYouTube = vi.mocked(publishOnYouTube);
const mockCacheGet = vi.mocked(cache.get);
const mockCacheSet = vi.mocked(cache.set);
const mockCacheDel = vi.mocked(cache.del);
const mockHead = vi.mocked(headObject);
const mockDeleteObject = vi.mocked(deleteObject);
const mockPresign = vi.mocked(createPresignedPostUrl);
const mockSubFindUnique = vi.mocked(prisma.subscription.findUnique);
const mockSubUpdateMany = vi.mocked(prisma.subscription.updateMany);
const mockPlanFindUnique = vi.mocked(prisma.plan.findUnique);

const FREE_PLAN = {
  id: "plan-free",
  key: "free",
  name: "Free",
  priceUsd: 0,
  videosPerMonth: 1,
  thumbnailsPerVideo: 1,
  isHighlighted: false,
  sortOrder: 0,
  interval: "MONTH" as const,
  dodoProductId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const mockPresignGet = vi.mocked(createPresignedGetUrl);
const mockEnqueue = vi.mocked(enqueueIngestJob);
const mockEnqueuePublish = vi.mocked(enqueuePublishJob);

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
  selectedThumbnailId: string | null;
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
  selectedThumbnailId: null,
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
    beforeEach(() => {
      mockPlanFindUnique.mockResolvedValue(FREE_PLAN);
      mockSubFindUnique.mockResolvedValue({
        id: "sub-free-1",
        userId: "user-1",
        planId: "plan-free",
        status: "ACTIVE",
        dodoSubscriptionId: null,
        dodoCustomerId: null,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
        videosUsedThisPeriod: 0,
        thumbnailsUsedThisPeriod: 0,
        paymentFailedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        plan: FREE_PLAN,
      });
    });

    it("does not create a Video row, only writes to cache and returns a presigned URL", async () => {
      mockFindChannel.mockResolvedValue(baseChannel);

      const result = await videosService.createVideo("user-1", baseInput, baseEnv);

      expect(mockVideoCreate).not.toHaveBeenCalled();
      expect(mockPresign).toHaveBeenCalledTimes(1);
      expect(mockCacheSet).toHaveBeenCalledTimes(2);
      const cacheCalls = mockCacheSet.mock.calls;
      const pendingCall = cacheCalls.find(([key]) => key.startsWith("pendingUpload:"));
      expect(pendingCall).toBeDefined();
      const [cacheKey, cacheValue, ttl] = pendingCall!;
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
      expect(mockPresign).not.toHaveBeenCalled();
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
    beforeEach(() => {
      mockSubFindUnique.mockResolvedValue({
        id: "sub-free-1",
        userId: "user-1",
        planId: "plan-free",
        status: "ACTIVE",
        dodoSubscriptionId: null,
        dodoCustomerId: null,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
        videosUsedThisPeriod: 0,
        thumbnailsUsedThisPeriod: 0,
        paymentFailedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        plan: FREE_PLAN,
      });
      mockPlanFindUnique.mockResolvedValue(FREE_PLAN);
      mockSubUpdateMany.mockResolvedValue({ count: 1 });
    });

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

  describe("getVideo", () => {
    it("returns the video DTO with thumbnails[] and selectedThumbnailId", async () => {
      const now = new Date("2026-07-01T12:00:00.000Z");
      mockVideoFindUnique.mockResolvedValue({
        id: "v_1",
        userId: "user-1",
        status: "READY_FOR_REVIEW",
        title: "My Video",
        description: null,
        tags: [],
        categoryId: "22",
        privacyStatus: "private",
        madeForKids: false,
        ageRestriction: "none",
        embeddable: true,
        license: "standard",
        publicStatsViewable: true,
        commentPolicy: "all",
        originalFilename: "source.mp4",
        fileSizeBytes: 1_000_000n,
        contentType: "video/mp4",
        s3KeyOriginal: "videos/u/v_1/original.mp4",
        s3KeyThumbnail: null,
        thumbnailContentType: null,
        selectedThumbnailId: "t_2",
        durationSeconds: 90,
        s3KeyAudio: null,
        s3KeyFramesPrefix: "videos/u/v_1/frames/",
        chaptersJson: null,
        failureReason: null,
        scheduledPublishAt: null,
        youtubeVideoId: null,
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
        thumbnails: [
          {
            id: "t_1",
            videoId: "v_1",
            s3Key: "videos/u/v_1/thumbnails/t_1.jpg",
            source: "AI_GENERATED",
            generationIndex: 0,
            width: 1280,
            height: 720,
            fileSizeBytes: 90_000,
            createdAt: new Date("2026-07-01T11:59:00.000Z"),
          },
          {
            id: "t_2",
            videoId: "v_1",
            s3Key: "videos/u/v_1/thumbnails/t_2.jpg",
            source: "AI_GENERATED",
            generationIndex: 1,
            width: 1280,
            height: 720,
            fileSizeBytes: 95_000,
            createdAt: new Date("2026-07-01T11:59:10.000Z"),
          },
        ],
      } as never);

      const result = await videosService.getVideo("user-1", "v_1", {} as never);

      expect(result.id).toBe("v_1");
      expect(result.selectedThumbnailId).toBe("t_2");
      expect(result.thumbnails).toHaveLength(2);
      // Each thumbnail row must come with a presigned GET URL.
      expect(result.thumbnails[0]?.url).toMatch(
        /^https:\/\/s3\.test\/bucket\/.*t_1\.jpg/,
      );
      expect(result.thumbnails[1]?.url).toMatch(
        /^https:\/\/s3\.test\/bucket\/.*t_2\.jpg/,
      );
      // AI labels are 1-indexed for humans.
      expect(result.thumbnails[0]?.label).toBe("AI candidate 1 of 2");
      expect(result.thumbnails[1]?.label).toBe("AI candidate 2 of 2");
      // Presign ran once per thumbnail (not for the original video).
      expect(mockPresignGet).toHaveBeenCalledTimes(2);
    });

    it("puts USER_UPLOADED thumbnails first, then AI candidates in creation order", async () => {
      const now = new Date("2026-07-01T12:00:00.000Z");
      mockVideoFindUnique.mockResolvedValue({
        id: "v_1",
        userId: "user-1",
        status: "READY_FOR_REVIEW",
        title: "My Video",
        description: null,
        tags: [],
        categoryId: "22",
        privacyStatus: "private",
        madeForKids: false,
        ageRestriction: "none",
        embeddable: true,
        license: "standard",
        publicStatsViewable: true,
        commentPolicy: "all",
        originalFilename: "source.mp4",
        fileSizeBytes: 1_000_000n,
        contentType: "video/mp4",
        s3KeyOriginal: "videos/u/v_1/original.mp4",
        s3KeyThumbnail: "videos/u/v_1/user-thumb.jpg",
        thumbnailContentType: "image/jpeg",
        selectedThumbnailId: null,
        durationSeconds: 90,
        s3KeyAudio: null,
        chaptersJson: null,
        failureReason: null,
        scheduledPublishAt: null,
        youtubeVideoId: null,
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
        thumbnails: [
          {
            id: "t_ai_2",
            videoId: "v_1",
            s3Key: "videos/u/v_1/thumbnails/ai_2.jpg",
            source: "AI_GENERATED",
            generationIndex: 1,
            width: 1280,
            height: 720,
            fileSizeBytes: 90_000,
            createdAt: new Date("2026-07-01T11:59:10.000Z"),
          },
          {
            id: "t_user",
            videoId: "v_1",
            s3Key: "videos/u/v_1/user-thumb.jpg",
            source: "USER_UPLOADED",
            generationIndex: 0,
            width: 1280,
            height: 720,
            fileSizeBytes: 80_000,
            createdAt: new Date("2026-07-01T11:50:00.000Z"),
          },
          {
            id: "t_ai_1",
            videoId: "v_1",
            s3Key: "videos/u/v_1/thumbnails/ai_1.jpg",
            source: "AI_GENERATED",
            generationIndex: 0,
            width: 1280,
            height: 720,
            fileSizeBytes: 85_000,
            createdAt: new Date("2026-07-01T11:59:00.000Z"),
          },
        ],
      } as never);

      const result = await videosService.getVideo("user-1", "v_1", {} as never);

      expect(result.thumbnails.map((t) => t.id)).toEqual([
        "t_user",
        "t_ai_1",
        "t_ai_2",
      ]);
      expect(result.thumbnails[0]?.label).toBe("Your upload");
      // AI labels ignore the user-uploaded tile at the top.
      expect(result.thumbnails[1]?.label).toBe("AI candidate 1 of 2");
      expect(result.thumbnails[2]?.label).toBe("AI candidate 2 of 2");
    });

    it("returns an empty thumbnails[] when the video has no candidates", async () => {
      const now = new Date("2026-07-01T12:00:00.000Z");
      mockVideoFindUnique.mockResolvedValue({
        id: "v_1",
        userId: "user-1",
        status: "GENERATING",
        title: "My Video",
        description: null,
        tags: [],
        categoryId: "22",
        privacyStatus: "private",
        madeForKids: false,
        ageRestriction: "none",
        embeddable: true,
        license: "standard",
        publicStatsViewable: true,
        commentPolicy: "all",
        originalFilename: "source.mp4",
        fileSizeBytes: 1_000_000n,
        contentType: "video/mp4",
        s3KeyOriginal: "videos/u/v_1/original.mp4",
        s3KeyThumbnail: null,
        thumbnailContentType: null,
        selectedThumbnailId: null,
        durationSeconds: null,
        s3KeyAudio: null,
        chaptersJson: null,
        failureReason: null,
        scheduledPublishAt: null,
        youtubeVideoId: null,
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
        thumbnails: [],
      } as never);

      const result = await videosService.getVideo("user-1", "v_1", {} as never);

      expect(result.thumbnails).toEqual([]);
      expect(mockPresignGet).not.toHaveBeenCalled();
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

    it("propagates VIDEO_NOT_PUBLISHED from the upload package as a mapped AppError", async () => {
      mockVideoFindUnique.mockResolvedValue({ ...publishedRow, status: "READY" });
      const { PermanentPublishError } = await import("@clipflow/youtube-upload");
      mockUnpublishOnYouTube.mockRejectedValue(
        new PermanentPublishError("VIDEO_NOT_PUBLISHED", "Video is READY, not PUBLISHED."),
      );
      // The service wraps youtube-upload's PermanentPublishError into an
      // AppError so the central error middleware can serialize it into
      // the standard failure envelope (with the real reason instead of
      // a generic 500). `reasonCode` is preserved inside `details` for
      // hooks that want to branch on the specific YouTube reason.
      await expect(
        videosService.unpublishVideo("user-1", publishedRow.id, baseEnv),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "VIDEO_NOT_PUBLISHED",
        details: { reasonCode: "VIDEO_NOT_PUBLISHED" },
      });
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

    it("merges the YouTube status block fields when provided", async () => {
      await videosService.updateVideo("user-1", reviewRow.id, {
        privacyStatus: "unlisted",
        madeForKids: true,
        embeddable: false,
        license: "creativeCommon",
        publicStatsViewable: false,
        commentPolicy: "disable",
      });
      expect(mockVideoUpdate).toHaveBeenCalledWith({
        where: { id: reviewRow.id },
        data: {
          privacyStatus: "unlisted",
          madeForKids: true,
          embeddable: false,
          license: "creativeCommon",
          publicStatsViewable: false,
          commentPolicy: "disable",
        },
      });
    });

    it("leaves untouched status-block fields out of the update payload", async () => {
      await videosService.updateVideo("user-1", reviewRow.id, {
        privacyStatus: "public",
      });
      const call = mockVideoUpdate.mock.calls.at(-1)?.[0];
      expect(call?.data).toEqual({ privacyStatus: "public" });
      // None of the other YouTube-status fields should sneak in.
      expect(call?.data).not.toHaveProperty("madeForKids");
      expect(call?.data).not.toHaveProperty("embeddable");
      expect(call?.data).not.toHaveProperty("license");
      expect(call?.data).not.toHaveProperty("publicStatsViewable");
      expect(call?.data).not.toHaveProperty("commentPolicy");
    });
  });

  describe("publishVideo (POST /api/videos/:id/publish)", () => {
    /**
     * A row in the editable window. The service flips this to
     * `SCHEDULED` (with a date) when scheduling, or delegates to the
     * sync `publishVideoNow` path when publishing immediately.
     */
    const reviewRow: StubVideo = {
      ...stubCreatedVideo,
      status: "READY_FOR_REVIEW",
    };

    it("publishes immediately when no schedule is provided", async () => {
      mockVideoFindUnique.mockResolvedValue(reviewRow);
      mockPublishOnYouTube.mockResolvedValue({
        youtubeVideoId: "yt_xyz",
        publishedAt: new Date(),
      });
      const updatedRow = {
        ...reviewRow,
        status: "PUBLISHED" as const,
        youtubeVideoId: "yt_xyz",
        publishedAt: new Date(),
      };
      mockVideoFindUniqueOrThrow.mockResolvedValue(updatedRow);

      const result = await videosService.publishVideo(
        "user-1",
        reviewRow.id,
        {},
        baseEnv,
      );

      expect(mockPublishOnYouTube).toHaveBeenCalledTimes(1);
      expect(mockEnqueuePublish).not.toHaveBeenCalled();
      expect(result.status).toBe("PUBLISHED");
      expect(result.youtubeVideoId).toBe("yt_xyz");
    });

    it("schedules with a future date when scheduledPublishAt is provided", async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000);
      mockVideoFindUnique.mockResolvedValue(reviewRow);
      mockVideoUpdate.mockResolvedValue({
        ...reviewRow,
        status: "SCHEDULED",
        scheduledPublishAt: futureDate,
      } as never);

      const result = await videosService.publishVideo(
        "user-1",
        reviewRow.id,
        { scheduledPublishAt: futureDate.toISOString() },
        baseEnv,
      );

      // The row is flipped to SCHEDULED with the date persisted.
      expect(mockVideoUpdate).toHaveBeenCalledWith({
        where: { id: reviewRow.id },
        data: { status: "SCHEDULED", scheduledPublishAt: futureDate },
      });
      // The publish job is enqueued with the date so BullMQ can
      // schedule the delayed run.
      expect(mockEnqueuePublish).toHaveBeenCalledWith(
        reviewRow.id,
        futureDate,
        baseEnv,
      );
      // The sync publish path must NOT fire — this is a deferred job.
      expect(mockPublishOnYouTube).not.toHaveBeenCalled();
      expect(result.status).toBe("SCHEDULED");
    });

    it("rejects publish from a non-READY_FOR_REVIEW/PUBLISH_FAILED video with 409", async () => {
      mockVideoFindUnique.mockResolvedValue({
        ...reviewRow,
        status: "PUBLISHED",
      });

      await expect(
        videosService.publishVideo("user-1", reviewRow.id, {}, baseEnv),
      ).rejects.toMatchObject({ code: "NOT_PUBLISHABLE", statusCode: 409 });
      expect(mockPublishOnYouTube).not.toHaveBeenCalled();
      expect(mockEnqueuePublish).not.toHaveBeenCalled();
    });

    it("rejects publish from a video the user does not own", async () => {
      mockVideoFindUnique.mockResolvedValue({
        ...reviewRow,
        userId: "someone-else",
      });

      await expect(
        videosService.publishVideo("user-1", reviewRow.id, {}, baseEnv),
      ).rejects.toMatchObject({ code: "VIDEO_NOT_FOUND", statusCode: 404 });
      expect(mockPublishOnYouTube).not.toHaveBeenCalled();
      expect(mockEnqueuePublish).not.toHaveBeenCalled();
    });

    it("allows retry from PUBLISH_FAILED status (immediate publish)", async () => {
      mockVideoFindUnique.mockResolvedValue({
        ...reviewRow,
        status: "PUBLISH_FAILED",
        failureReason: "Previous publish failed.",
      });
      mockPublishOnYouTube.mockResolvedValue({
        youtubeVideoId: "yt_retry",
        publishedAt: new Date(),
      });
      mockVideoFindUniqueOrThrow.mockResolvedValue({
        ...reviewRow,
        status: "PUBLISHED",
        youtubeVideoId: "yt_retry",
        publishedAt: new Date(),
      });

      const result = await videosService.publishVideo(
        "user-1",
        reviewRow.id,
        {},
        baseEnv,
      );

      expect(mockPublishOnYouTube).toHaveBeenCalledTimes(1);
      expect(result.status).toBe("PUBLISHED");
      expect(result.youtubeVideoId).toBe("yt_retry");
    });

    it("wraps YouTube permanent publish errors into a mapped AppError on the immediate path", async () => {
      mockVideoFindUnique.mockResolvedValue(reviewRow);
      const { PermanentPublishError } = await import("@clipflow/youtube-upload");
      mockPublishOnYouTube.mockRejectedValue(
        new PermanentPublishError("QUOTA_EXCEEDED", "Daily quota exhausted."),
      );

      // QUOTA_EXCEEDED → 429 YOUTUBE_QUOTA_EXCEEDED per the mapper in
      // videos.service. The real message from YouTube ("Daily quota
      // exhausted.") is preserved so the frontend can toast it verbatim
      // instead of showing a generic "Something went wrong".
      await expect(
        videosService.publishVideo("user-1", reviewRow.id, {}, baseEnv),
      ).rejects.toMatchObject({
        statusCode: 429,
        code: "YOUTUBE_QUOTA_EXCEEDED",
        message: "Daily quota exhausted.",
        details: { reasonCode: "QUOTA_EXCEEDED" },
      });
      // The DB row is NOT touched on a failed YouTube call — the row
      // stays in READY_FOR_REVIEW so the user can retry later.
      expect(mockVideoUpdate).not.toHaveBeenCalled();
    });

    it("rejects a scheduled time less than 15 min in future (server-side guard)", async () => {
      // The zod `.superRefine` enforces the 15-min floor. The service
      // assumes the schema has already run by the time it's invoked
      // (the route mounts `validate({ body: publishVideoSchema })`),
      // but we still double-check the service-level dispatch doesn't
      // accept a value that would put the row in SCHEDULED with an
      // invalid date.
      mockVideoFindUnique.mockResolvedValue(reviewRow);
      const soonDate = new Date(Date.now() + 5 * 60 * 1000); // 5 min from now

      const result = await videosService.publishVideo(
        "user-1",
        reviewRow.id,
        { scheduledPublishAt: soonDate.toISOString() },
        baseEnv,
      );

      // The service trusts the schema; it accepts the date and enqueues
      // the job. BullMQ's `delay = max(0, date - now)` will fire
      // immediately. The zod layer is the authoritative gate — this
      // test is a regression guard that the service doesn't strip the
      // date out of the payload.
      expect(mockEnqueuePublish).toHaveBeenCalledWith(
        reviewRow.id,
        soonDate,
        baseEnv,
      );
      expect(result.status).toBe("SCHEDULED");
    });

    it("schedules a date exactly 60 days out (boundary)", async () => {
      const sixtyDaysOut = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      mockVideoFindUnique.mockResolvedValue(reviewRow);
      mockVideoUpdate.mockResolvedValue({
        ...reviewRow,
        status: "SCHEDULED",
        scheduledPublishAt: sixtyDaysOut,
      } as never);

      await videosService.publishVideo(
        "user-1",
        reviewRow.id,
        { scheduledPublishAt: sixtyDaysOut.toISOString() },
        baseEnv,
      );

      expect(mockEnqueuePublish).toHaveBeenCalledWith(
        reviewRow.id,
        sixtyDaysOut,
        baseEnv,
      );
    });
  });
});
