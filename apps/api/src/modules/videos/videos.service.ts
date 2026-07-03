/**
 * Videos service — owns all DB + S3 + YouTube-publish enqueue logic
 * for the upload → publish flow.
 *
 * Lifecycle (v1.1: row created only after upload is confirmed):
 *
 *   POST   /api/videos                       → mints `pendingUploadId`,
 *                                              presigned POST URL, and
 *                                              stores metadata in cache.
 *                                              **No DB row yet.**
 *   POST   /api/videos/pending/:id/upload-url → fresh presigned POST
 *                                              (cache lookup, not DB).
 *   POST   /api/videos/pending/:id/finalize  → HEADs S3, validates size,
 *                                              creates the `Video` row,
 *                                              transitions to READY or
 *                                              SCHEDULED, enqueues job.
 *                                              No row if S3 has no object
 *                                              or size mismatches.
 *   DELETE /api/videos/pending/:id           → cancel an in-flight upload;
 *                                              best-effort S3 delete +
 *                                              cache eviction.
 *   GET    /api/videos                       → list committed videos.
 *   GET    /api/videos/:id                   → single committed video.
 *   DELETE /api/videos/:id                   → cancel a not-yet-published
 *                                              committed video.
 *
 * The two-step create→finalize flow is deliberate: the browser PUTs the
 * file directly to S3 (the API never sees the bytes) and only after the
 * bytes are confirmed in place does the API commit a row. This means an
 * abandoned upload (closed tab, network error, partial PUT) leaves zero
 * residue in the DB and the dashboard stays honest.
 *
 * The status transitions are deliberately conservative: PUBLISHED rows
 * are immutable in v1 (YouTube is the source of truth). A future slice
 * can re-fetch state if needed.
 */
import { randomUUID } from "node:crypto";
import type { Env } from "@clipflow/config";
import type {
  CreateVideoResponse,
  PaginatedVideos,
  UploadUrlResponse,
  Video,
  VideoStatus,
} from "@clipflow/types";
import {
  buildS3Config,
  createPresignedGetUrl,
  createPresignedPostUrl,
  deleteObject,
  getS3Client,
  headObject,
} from "@clipflow/s3";
import { publishVideo as publishVideoOnYouTube, unpublishVideo as unpublishVideoOnYouTube, uploadVideoThumbnail } from "@clipflow/youtube-upload";
import { pino } from "pino";
import { AppError } from "../../errors/AppError.js";
import { prisma } from "../../lib/prisma.js";
import { requireDatabase } from "../../lib/db-guard.js";
import { cache } from "../../lib/cache.js";
import { enqueueIngestJob, enqueuePublishJob } from "../../lib/queue.js";
import { toVideoDto } from "./videos.types.js";
import type {
  CreateVideoInput,
  ListPublishedVideosQuery,
  ListVideosQuery,
  PublishVideoInput,
  UpdateVideoInput,
} from "./videos.schemas.js";

const ALLOWED_DELETE_STATUSES: ReadonlySet<VideoStatus> = new Set([
  "UPLOADED",
  "EXTRACTING",
  "TRANSCRIBING",
  "GENERATING",
  "READY_FOR_REVIEW",
  "READY",
  "SCHEDULED",
  "PUBLISH_FAILED",
]);

/**
 * YouTube's hard limit on `thumbnails.set` uploads. Mirrored in
 * `videos.schemas.ts → thumbnailFileSizeBytesSchema`. Kept here so
 * the runtime cap on the presigned POST can reference the same
 * source of truth without an import cycle.
 */
const YOUTUBE_MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;

/**
 * Cache-key namespace for in-flight uploads. The TTL matches the
 * presigned-URL TTL (`env.YOUTUBE_PRESIGNED_POST_TTL`) so a stale
 * presigned URL also produces a cache miss, which is the signal to
 * the client that the upload must be re-prepared from scratch.
 */
const PENDING_UPLOAD_KEY_PREFIX = "pendingUpload:";

/**
 * Shape of the JSON blob stored under `pendingUpload:<id>`. The server
 * is the source of truth for these fields between `createVideo` and
 * `finalizeUpload`; the client only sees the `pendingUploadId` handle.
 */
interface PendingUpload {
  userId: string;
  channelId: string;
  s3KeyOriginal: string;
  contentType: string;
  fileSizeBytes: number;
  /**
   * Thumbnail block. `null` when the user didn't pick a custom
   * thumbnail — in that case the publish path leaves YouTube to
   * pick a generated frame. When present, `finalizeUpload` HEADs the
   * object at `s3KeyThumbnail` and the publish path forwards it to
   * YouTube's `thumbnails.set` endpoint.
   */
  thumbnail: {
    s3KeyThumbnail: string;
    contentType: string;
    fileSizeBytes: number;
  } | null;
  metadata: {
    title: string;
    description: string | null;
    tags: string[];
    categoryId: string;
    privacyStatus: string;
    originalFilename: string;
    scheduledPublishAt: string | null;
    madeForKids: boolean;
    ageRestriction: string;
    embeddable: boolean;
    license: string;
    publicStatsViewable: boolean;
    commentPolicy: string;
  };
}

/**
 * Validate a YouTube channel is present and ready before we let the
 * user kick off an upload. Mirrors the checks the old `createVideo`
 * performed; hoisted so `createVideo` and any future `retry` endpoint
 * can share them.
 */
const requireConnectedChannel = async (
  userId: string,
): Promise<{ id: string }> => {
  const channel = await prisma.youTubeChannel.findUnique({
    where: { userId },
    select: { id: true, status: true },
  });
  if (!channel) {
    throw new AppError(
      412,
      "YOUTUBE_NOT_CONNECTED",
      "Connect your YouTube channel before uploading videos.",
    );
  }
  if (channel.status !== "CONNECTED") {
    throw new AppError(
      412,
      "YOUTUBE_NEEDS_REAUTH",
      "Your YouTube channel needs to be reconnected.",
    );
  }
  return { id: channel.id };
};

/**
 * Mint a `pendingUploadId`, a presigned S3 POST URL, and stash the
 * metadata in cache. Returns the handle the browser uses for the
 * subsequent PUT + finalize.
 *
 * Crucially, this does NOT create a `Video` row. The row is created in
 * `finalizeUpload` only after the API has confirmed the bytes landed
 * in S3. This eliminates the "UPLOADED row with no file" failure mode.
 */
export const createVideo = async (
  userId: string,
  input: CreateVideoInput,
  env: Env,
): Promise<CreateVideoResponse> => {
  requireDatabase();

  const channel = await requireConnectedChannel(userId);

  const s3 = buildS3Config(env);
  const client = getS3Client(s3);
  const pendingUploadId = `pu_${randomUUID()}`;
  const ext = inferExtension(input.originalFilename, input.contentType);
  // The `pending/` prefix scopes partial uploads so a future S3
  // lifecycle rule (e.g. expire after 24h) can clean them up without
  // touching the committed path.
  const s3KeyOriginal = `videos/${userId}/pending/${pendingUploadId}/original.${ext}`;

  const presigned = await createPresignedPostUrl(client, s3, {
    key: s3KeyOriginal,
    contentType: input.contentType,
    contentLengthMaxBytes: env.YOUTUBE_MAX_VIDEO_BYTES,
    expiresInSeconds: env.YOUTUBE_PRESIGNED_POST_TTL,
  });

  // ---- Optional custom thumbnail ----
  //
  // We only mint a second presigned URL when the client provided
  // thumbnail metadata. The byte size cap matches YouTube's own
  // (2 MB) — `videos.schemas.ts` already rejects oversize at the
  // edge, this is the runtime guard.
  let thumbnail: PendingUpload["thumbnail"] = null;
  let thumbnailPresigned: {
    s3KeyThumbnail: string;
    postUrl: string;
    fields: Record<string, string>;
    contentLengthMaxBytes: number;
  } | null = null;
  if (
    input.thumbnailContentType &&
    input.thumbnailFileSizeBytes !== undefined &&
    input.thumbnailOriginalFilename
  ) {
    const thumbExt = inferThumbnailExtension(
      input.thumbnailOriginalFilename,
      input.thumbnailContentType,
    );
    const s3KeyThumbnail = `videos/${userId}/pending/${pendingUploadId}/thumbnail.${thumbExt}`;
    const presignedThumb = await createPresignedPostUrl(client, s3, {
      key: s3KeyThumbnail,
      contentType: input.thumbnailContentType,
      // YouTube rejects >2 MB on `thumbnails.set`; we cap the
      // presigned POST the same way so the browser can't even
      // start an upload that the publish path will reject.
      contentLengthMaxBytes: Math.min(
        input.thumbnailFileSizeBytes,
        YOUTUBE_MAX_THUMBNAIL_BYTES,
      ),
      expiresInSeconds: env.YOUTUBE_PRESIGNED_POST_TTL,
    });
    thumbnail = {
      s3KeyThumbnail,
      contentType: input.thumbnailContentType,
      fileSizeBytes: input.thumbnailFileSizeBytes,
    };
    thumbnailPresigned = {
      s3KeyThumbnail,
      postUrl: presignedThumb.postUrl,
      fields: presignedThumb.fields,
      contentLengthMaxBytes: presignedThumb.contentLengthMaxBytes,
    };
  }

  const pending: PendingUpload = {
    userId,
    channelId: channel.id,
    s3KeyOriginal,
    contentType: input.contentType,
    fileSizeBytes: input.fileSizeBytes,
    thumbnail,
    metadata: {
      title: input.title,
      description: input.description ?? null,
      tags: input.tags,
      categoryId: input.categoryId,
      privacyStatus: input.privacyStatus,
      originalFilename: input.originalFilename,
      scheduledPublishAt: input.scheduledPublishAt
        ? new Date(input.scheduledPublishAt).toISOString()
        : null,
      madeForKids: input.madeForKids,
      ageRestriction: input.ageRestriction,
      embeddable: input.embeddable,
      license: input.license,
      publicStatsViewable: input.publicStatsViewable,
      commentPolicy: input.commentPolicy,
    },
  };
  await cache.set(
    `${PENDING_UPLOAD_KEY_PREFIX}${pendingUploadId}`,
    JSON.stringify(pending),
    env.YOUTUBE_PRESIGNED_POST_TTL,
  );

  return {
    pendingUploadId,
    s3KeyOriginal,
    postUrl: presigned.postUrl,
    fields: presigned.fields,
    contentLengthMaxBytes: presigned.contentLengthMaxBytes,
    thumbnail: thumbnailPresigned,
  };
};

/**
 * Mint a fresh presigned POST URL for an in-flight upload. Useful when
 * the first URL expired (15 min default) before the browser finished a
 * slow upload. Cache miss → 404 so the client knows to re-prepare
 * (which gets a fresh `pendingUploadId` and starts the cache entry
 * over).
 */
export const getUploadUrl = async (
  userId: string,
  pendingUploadId: string,
  env: Env,
): Promise<UploadUrlResponse> => {
  requireDatabase();
  const pending = await loadPendingUploadForOwner(userId, pendingUploadId);
  const s3 = buildS3Config(env);
  const client = getS3Client(s3);
  const presigned = await createPresignedPostUrl(client, s3, {
    key: pending.s3KeyOriginal,
    contentType: pending.contentType,
    contentLengthMaxBytes: env.YOUTUBE_MAX_VIDEO_BYTES,
    expiresInSeconds: env.YOUTUBE_PRESIGNED_POST_TTL,
  });
  return {
    postUrl: presigned.postUrl,
    fields: presigned.fields,
    contentLengthMaxBytes: presigned.contentLengthMaxBytes,
  };
};

/**
 * Confirm a finished S3 upload and commit the `Video` row.
 *
 * Order of operations (and why):
 *  1. Cache lookup. If missing → 404 (`UPLOAD_NOT_FOUND`); the upload
 *     is too old, was cancelled, or never existed.
 *  2. Ownership check. Foreign id → 404 (don't leak existence).
 *  3. S3 HEAD. No object → 404 (bytes never landed). Size mismatch →
 *     `UPLOAD_INCOMPLETE` (partial PUT) — clean up S3 + cache so the
 *     next attempt starts fresh. Oversize → `FILE_TOO_LARGE` — same.
 *  4. Create the row in `UPLOADED`, then transition to `READY` or
 *     `SCHEDULED`, enqueue the publish job if immediate.
 *  5. `cache.del` the pending entry.
 *
 * If any of (1)–(3) fail, no row is created. Step (4) is the only path
 * that writes to the DB; if Prisma throws there we let it surface as a
 * 500 and the cache entry stays so a retry can attempt finalize again
 * (but in practice the row creation failure is unrecoverable and the
 * cache will TTL out).
 */
export const finalizeUpload = async (
  userId: string,
  pendingUploadId: string,
  env: Env,
): Promise<Video> => {
  requireDatabase();
  const pending = await loadPendingUploadForOwner(userId, pendingUploadId);

  const s3 = buildS3Client(env);
  const head = await headObject(s3.client, s3.config, pending.s3KeyOriginal);
  if (!head) {
    await cache.del(`${PENDING_UPLOAD_KEY_PREFIX}${pendingUploadId}`);
    throw new AppError(
      404,
      "UPLOAD_NOT_FOUND",
      "Your upload didn't reach storage. Please try again.",
    );
  }

  if (head.contentLength !== pending.fileSizeBytes) {
    // Partial PUT — the presigned POST allows 0..maxBytes, so a network
    // drop can leave a smaller object. Clean it up so re-upload doesn't
    // surface as a 412 on a stale key. Same for the thumbnail if any
    // bytes landed.
    await deleteObject(s3.client, s3.config, pending.s3KeyOriginal).catch(() => {
      // best-effort cleanup
    });
    if (pending.thumbnail) {
      await deleteObject(s3.client, s3.config, pending.thumbnail.s3KeyThumbnail).catch(() => {
        // best-effort cleanup
      });
    }
    await cache.del(`${PENDING_UPLOAD_KEY_PREFIX}${pendingUploadId}`);
    throw new AppError(
      400,
      "UPLOAD_INCOMPLETE",
      "Your upload was interrupted. Please re-upload.",
    );
  }

  if (head.contentLength > env.YOUTUBE_MAX_VIDEO_BYTES) {
    await deleteObject(s3.client, s3.config, pending.s3KeyOriginal).catch(() => {
      // best-effort cleanup
    });
    if (pending.thumbnail) {
      await deleteObject(s3.client, s3.config, pending.thumbnail.s3KeyThumbnail).catch(() => {
        // best-effort cleanup
      });
    }
    await cache.del(`${PENDING_UPLOAD_KEY_PREFIX}${pendingUploadId}`);
    throw new AppError(
      413,
      "FILE_TOO_LARGE",
      `File exceeds the ${formatBytes(env.YOUTUBE_MAX_VIDEO_BYTES)} limit.`,
    );
  }

  // ---- Thumbnail validation (optional) ----
  //
  // If the user picked a thumbnail, the upload is now confirmed. We
  // HEAD the object (same defense-in-depth pattern as the video
  // bytes) and persist the key on the row. A missing object or size
  // mismatch here is treated as "thumbnail didn't make it" — we
  // silently drop it from the row rather than failing the whole
  // finalize, because the video is fine without a custom thumbnail
  // (YouTube will use a generated frame).
  let thumbnailS3Key: string | null = null;
  let thumbnailContentType: string | null = null;
  if (pending.thumbnail) {
    const thumbHead = await headObject(
      s3.client,
      s3.config,
      pending.thumbnail.s3KeyThumbnail,
    );
    if (
      thumbHead &&
      thumbHead.contentLength === pending.thumbnail.fileSizeBytes &&
      thumbHead.contentLength <= YOUTUBE_MAX_THUMBNAIL_BYTES
    ) {
      thumbnailS3Key = pending.thumbnail.s3KeyThumbnail;
      thumbnailContentType = pending.thumbnail.contentType;
    } else if (thumbHead) {
      // Partial PUT or wrong content type — clean up so a re-upload
      // doesn't trip on a stale key.
      await deleteObject(s3.client, s3.config, pending.thumbnail.s3KeyThumbnail).catch(
        () => {
          // best-effort cleanup
        },
      );
    }
  }

  const videoId = `vid_${randomUUID()}`;
  const video = await prisma.video.create({
    data: {
      id: videoId,
      userId: pending.userId,
      youtubeChannelId: pending.channelId,
      title: pending.metadata.title,
      description: pending.metadata.description,
      tags: pending.metadata.tags,
      categoryId: pending.metadata.categoryId,
      privacyStatus: pending.metadata.privacyStatus,
      madeForKids: pending.metadata.madeForKids,
      ageRestriction: pending.metadata.ageRestriction,
      embeddable: pending.metadata.embeddable,
      license: pending.metadata.license,
      publicStatsViewable: pending.metadata.publicStatsViewable,
      commentPolicy: pending.metadata.commentPolicy,
      originalFilename: pending.metadata.originalFilename,
      fileSizeBytes: BigInt(head.contentLength),
      contentType: head.contentType ?? pending.contentType,
      s3KeyOriginal: pending.s3KeyOriginal,
      s3KeyThumbnail: thumbnailS3Key,
      thumbnailContentType,
      // Preserve the user's scheduled-publish intent — the post-
      // generation flow will read this and either enqueue an
      // immediate publish or schedule one. finalizeUpload itself
      // never enqueues youtube-publish; that responsibility moves
      // to the generation-complete hook (transcription slice).
      scheduledPublishAt: pending.metadata.scheduledPublishAt
        ? new Date(pending.metadata.scheduledPublishAt)
        : null,
      status: "UPLOADED",
    },
  });

  // Move straight to EXTRACTING and hand off to the ingest queue.
  // The worker reads the original from S3, extracts audio + frames,
  // and (in a follow-up slice) eventually enqueues the publish job.
  const updated = await prisma.video.update({
    where: { id: video.id },
    data: { status: "EXTRACTING" },
  });

  await enqueueIngestJob(video.id, env);

  await cache.del(`${PENDING_UPLOAD_KEY_PREFIX}${pendingUploadId}`);

  return toVideoDto(updated);
};

/**
 * Cancel an in-flight upload: best-effort S3 delete + cache eviction.
 * Idempotent — a missing cache entry returns 204 (treat as already
 * cancelled) so retries from a flaky network don't surface as 404s.
 */
export const cancelPendingUpload = async (
  userId: string,
  pendingUploadId: string,
  env: Env,
): Promise<void> => {
  requireDatabase();
  const raw = await cache.get(`${PENDING_UPLOAD_KEY_PREFIX}${pendingUploadId}`);
  if (!raw) {
    // Already gone (TTL'd or already cancelled) — nothing to do.
    return;
  }
  let pending: PendingUpload;
  try {
    pending = JSON.parse(raw) as PendingUpload;
  } catch {
    // Corrupt entry — clean it up and bail.
    await cache.del(`${PENDING_UPLOAD_KEY_PREFIX}${pendingUploadId}`);
    return;
  }
  if (pending.userId !== userId) {
    // Don't reveal that the id exists for another user.
    return;
  }
  const s3 = buildS3Client(env);
  await deleteObject(s3.client, s3.config, pending.s3KeyOriginal).catch(() => {
    // best-effort; the cache eviction below is the source of truth.
  });
  if (pending.thumbnail) {
    await deleteObject(s3.client, s3.config, pending.thumbnail.s3KeyThumbnail).catch(
      () => {
        // best-effort; same source-of-truth as above.
      },
    );
  }
  await cache.del(`${PENDING_UPLOAD_KEY_PREFIX}${pendingUploadId}`);
};

/**
 * Cancel + delete a committed, not-yet-published video. Removes the
 * S3 object (best-effort) and the DB row. Unchanged from the pre-fix
 * flow.
 */
export const deleteVideo = async (
  userId: string,
  videoId: string,
  env: Env,
): Promise<void> => {
  requireDatabase();
  const video = await loadVideoForOwner(userId, videoId);
  if (!ALLOWED_DELETE_STATUSES.has(video.status as VideoStatus)) {
    throw new AppError(
      409,
      "VIDEO_NOT_DELETABLE",
      "Published videos can't be deleted from ClipFlow — manage them on YouTube.",
    );
  }
  const s3 = buildS3Client(env);
  await deleteObject(s3.client, s3.config, video.s3KeyOriginal).catch(() => {
    // best-effort; the DB row is the source of truth for the user
  });
  await prisma.video.delete({ where: { id: video.id } });
};

/**
 * Translate the parsed query's `status` field into a Prisma `where`
 * fragment. The schema accepts either a real lifecycle status OR the
 * virtual `NOT_PUBLISHED` sentinel — the sentinel means "anything but
 * PUBLISHED", which the dashboard uses so it doesn't have to mirror
 * the union client-side.
 *
 * `undefined` means "all statuses" (the search-only path used by the
 * generic `/api/videos` endpoint).
 */
const buildStatusFilter = (
  status: ListVideosQuery["status"],
): { status?: VideoStatus | { not: VideoStatus } } => {
  if (!status) return {};
  if (status === "NOT_PUBLISHED") return { status: { not: "PUBLISHED" } };
  return { status };
};

/**
 * Build the Prisma `where` clause for a list query: owner scope +
 * optional status filter + optional case-insensitive search across
 * title, description, and tags.
 *
 * Tag search uses `has` (case-sensitive on Postgres for arrays) but
 * the title/description `mode: "insensitive"` makes the common
 * "find by title fragment" UX feel right. The search runs as an OR
 * inside the AND — so a user with no rows matching still gets an
 * empty page (not a 500 from a mis-shaped where).
 */
const buildListWhere = (
  userId: string,
  query: {
    status?: ListVideosQuery["status"];
    q?: string;
    privacyStatus?: string;
    publishedSince?: Date;
  },
) => {
  const where: Record<string, unknown> = { userId };
  const statusFilter = buildStatusFilter(query.status);
  if (statusFilter.status !== undefined) where.status = statusFilter.status;

  if (query.q) {
    where.OR = [
      { title: { contains: query.q, mode: "insensitive" } },
      { description: { contains: query.q, mode: "insensitive" } },
      { tags: { has: query.q } },
    ];
  }

  // Privacy + date-range filters are additive on top of status/q.
  // They live in the same AND so combining `privacy=public&q=foo`
  // narrows the result rather than widening it.
  if (query.privacyStatus) {
    where.privacyStatus = query.privacyStatus;
  }
  if (query.publishedSince) {
    where.publishedAt = { gte: query.publishedSince };
  }

  return where;
};

/**
 * List the current user's committed videos, newest first. Pending
 * uploads are intentionally not visible — they live in the dialog
 * state and have no DB row.
 *
 * Returns a paginated envelope (`videos + total + page + pageSize +
 * totalPages`) so the frontend doesn't need a second round-trip to
 * know how many pages exist. The total count runs as a separate
 * `count` so the index hit on `(userId, createdAt)` doesn't have to
 * drag the full row set back through Postgres.
 *
 * The optional `status` filter powers the SSR dashboard
 * (`status: "NOT_PUBLISHED"`) and the published page
 * (`status: "PUBLISHED"`). The optional `q` does a substring match
 * across title, description, and tags.
 */
export const listVideos = async (
  userId: string,
  query: ListVideosQuery,
): Promise<PaginatedVideos> => {
  requireDatabase();
  // The zod schema applies `.default(1)` / `.default(12)` via transforms,
  // so by the time we get here `page` / `pageSize` are guaranteed
  // defined. The non-null assertion is the right escape hatch for
  // "the schema guarantees this" — using `?? 1` would silently swallow
  // a future regression where someone forgets to update the default.
  const page = query.page;
  const pageSize = query.pageSize;
  const where = buildListWhere(userId, query);

  const [rows, total] = await Promise.all([
    prisma.video.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.video.count({ where }),
  ]);

  return {
    videos: rows.map(toVideoDto),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
};

/**
 * List the current user's PUBLISHED videos, newest published first.
 * Powers the `/dashboard/published` page.
 *
 * Kept as a distinct helper (rather than
 * `listVideos(userId, { status: "PUBLISHED" })`) so future
 * PUBLISHED-only columns (e.g. joined stats) can land here without
 * touching the generic list path. Same paginated envelope as
 * `listVideos`; the `publishedAt desc` ordering is a hard contract
 * for this endpoint (the dashboard's "what's live, newest first"
 * mental model relies on it).
 */
export const listPublishedVideos = async (
  userId: string,
  query: ListPublishedVideosQuery,
): Promise<PaginatedVideos> => {
  requireDatabase();
  // See `listVideos` for why these are non-nullable here — the schema
  // transform guarantees them.
  const page = query.page;
  const pageSize = query.pageSize;
  // `privacy` was already transformed to undefined by the schema when
  // it's "all" or omitted; `since` is a raw ISO string at this layer
  // and needs to be parsed into a Date before Prisma can use it.
  const where = buildListWhere(userId, {
    ...query,
    status: "PUBLISHED",
    ...(query.privacy ? { privacyStatus: query.privacy } : {}),
    ...(query.since ? { publishedSince: new Date(query.since) } : {}),
  });

  const [rows, total] = await Promise.all([
    prisma.video.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.video.count({ where }),
  ]);

  return {
    videos: rows.map(toVideoDto),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
};

/**
 * Read a single committed video, scoped to the owner.
 */
export const getVideo = async (userId: string, videoId: string): Promise<Video> => {
  requireDatabase();
  const video = await loadVideoForOwner(userId, videoId);
  return toVideoDto(video);
};

/**
 * Get a short-lived presigned S3 GET URL for streaming the original
 * video in the browser. Used by the review page's video player.
 *
 * The URL expires after 15 minutes (the default TTL for presigned
 * GETs). The browser re-fetches via the endpoint if the URL expires.
 *
 * Returns `null` for rows that have no S3 key (shouldn't happen for
 * committed videos, but guards against edge cases gracefully).
 */
export const getPlaybackUrl = async (
  userId: string,
  videoId: string,
  env: Env,
): Promise<{ url: string }> => {
  requireDatabase();
  const video = await loadVideoForOwner(userId, videoId);
  if (!video.s3KeyOriginal) {
    throw new AppError(404, "VIDEO_NOT_FOUND", "Video source not found.");
  }
  const s3Config = buildS3Config(env);
  const client = getS3Client(s3Config);
  const url = await createPresignedGetUrl(
    client,
    s3Config,
    video.s3KeyOriginal,
    900,
    // Let the browser handle whatever content type S3 returns — we
    // don't override it so the <video> element can do its own MIME
    // sniffing.
  );
  return { url };
};

/**
 * In-place update for video metadata + chapters during the review
 * window. Used by the editor on `/dashboard/videos/:id` while the row
 * is in `READY_FOR_REVIEW`.
 *
 * The endpoint is intentionally narrow:
 *
 *  - Only `READY_FOR_REVIEW` is editable. Anything before that
 *    (EXTRACTING / TRANSCRIBING / GENERATING) means the AI is still
 *    running; anything after (SCHEDULED / PUBLISHING / PUBLISHED /
 *    PUBLISH_FAILED / FAILED) means we'd have to either sync to
 *    YouTube (out of scope for v1) or race the publish job.
 *  - All fields optional, partial-merge semantics. The client picks
 *    which fields to change per save (so it can wire per-section save
 *    buttons in the UI without re-sending the whole shape).
 *  - The strict chapter invariants are enforced by `updateVideoSchema`
 *    at the edge, so by the time we reach this function the shape is
 *    already valid. We don't re-validate the chapter math here.
 *
 * The `chaptersJson` cast at the prisma boundary matches bug-084 —
 * Prisma's `InputJsonValue` requires an explicit index signature that
 * the typed `ChaptersJson` interface doesn't carry. Runtime
 * serialization is identical; the cast is purely nominal.
 */
export const updateVideo = async (
  userId: string,
  videoId: string,
  input: UpdateVideoInput,
): Promise<Video> => {
  requireDatabase();

  const existing = await loadVideoForOwner(userId, videoId);

  if (existing.status !== "READY_FOR_REVIEW") {
    throw new AppError(
      409,
      "NOT_EDITABLE",
      "Video can only be edited while in READY_FOR_REVIEW.",
    );
  }

  // Build the prisma update payload from the keys that actually
  // appeared in the request. We deliberately check `in input` rather
  // than `input.foo !== undefined` so that explicit `null` (clearing
  // the description) survives the merge — matches `useUpdateProfile`
  // semantics on the onboarding slice.
  const data: Record<string, unknown> = {};
  if ("title" in input) data.title = input.title;
  if ("description" in input) data.description = input.description;
  if ("tags" in input) data.tags = input.tags;

  // YouTube status block — every field optional. The publish worker
  // (`@clipflow/youtube-upload → buildStatusFromVideo`) reads these off
  // the row, so a successful PATCH here is what gets sent to YouTube on
  // the next publish.
  if ("privacyStatus" in input) data.privacyStatus = input.privacyStatus;
  if ("madeForKids" in input) data.madeForKids = input.madeForKids;
  if ("embeddable" in input) data.embeddable = input.embeddable;
  if ("license" in input) data.license = input.license;
  if ("publicStatsViewable" in input) data.publicStatsViewable = input.publicStatsViewable;
  if ("commentPolicy" in input) data.commentPolicy = input.commentPolicy;

  // summary + chapters must travel together through `chaptersJson`. If
  // either key is present, we (re)build the full object — otherwise
  // a partial save would clobber the LLM-generated counterpart.
  if ("summary" in input || "chapters" in input) {
    const current = (existing.chaptersJson as { summary?: string; chapters?: unknown[] } | null) ?? null;
    const summary = "summary" in input ? input.summary : current?.summary ?? "";
    const chapters = "chapters" in input ? input.chapters : current?.chapters ?? [];
    data.chaptersJson = { summary, chapters } as unknown as object;
  }

  const updated = await prisma.video.update({
    where: { id: existing.id },
    data,
  });

  return toVideoDto(updated);
};

/**
 * Unpublish a live video: flips its `privacyStatus` back to `private`
 * on YouTube and mirrors the change on the row. The row keeps
 * `status = "PUBLISHED"` — a live-but-private video is still a
 * published video from ClipFlow's perspective.
 *
 * YouTube-side failures surface as `PermanentPublishError` /
 * `TransientPublishError` from `@clipflow/youtube-upload`; we re-throw
 * so the central error middleware can map them. The DB row is only
 * updated after YouTube confirms the flip, so a failed unpublish
 * leaves the row honest (it still claims `public` until YouTube
 * says otherwise).
 */
export const unpublishVideo = async (
  userId: string,
  videoId: string,
  env: Env,
): Promise<Video> => {
  requireDatabase();
  // Ownership + existence check first — gives the standard 404 (not
  // 409 / 412) for the "wrong user" path, matching the rest of the
  // module. The YouTube-side publish check (VIDEO_NOT_PUBLISHED) is
  // delegated to `unpublishVideo` in the upload package.
  await loadVideoForOwner(userId, videoId);
  await unpublishVideoOnYouTube(
    { videoId },
    { prisma, env, logger: buildConsoleLogger("api") },
  );
  const updated = await prisma.video.findUniqueOrThrow({ where: { id: videoId } });
  return toVideoDto(updated);
};

/**
 * Re-export for the immediate-publish path. The controller calls this
 * for videos with no `scheduledPublishAt` so we publish synchronously
 * rather than waiting for the worker to pick up a fresh job.
 *
 * Currently unused in the controller — finalizeUpload always enqueues
 * because we want the request to return quickly. Exported so a future
 * "publish now" UI button can use it.
 */
export const publishVideoNow = async (
  userId: string,
  videoId: string,
  env: Env,
): Promise<Video> => {
  requireDatabase();
  await loadVideoForOwner(userId, videoId);
  const result = await publishVideoOnYouTube(
    { videoId },
    { prisma, env, logger: buildConsoleLogger("api") },
  );
  // Best-effort thumbnail upload — the video is already live.
  if (result.youtubeVideoId) {
    try {
      await uploadVideoThumbnail(
        { videoId, youtubeVideoId: result.youtubeVideoId },
        { prisma, env, logger: buildConsoleLogger("api") },
      );
    } catch {
      // Thumbnail failure doesn't undo the publish.
    }
  }
  const updated = await prisma.video.findUniqueOrThrow({ where: { id: videoId } });
  return toVideoDto(updated);
};

/**
 * User-driven publish endpoint. Dispatches to one of two paths:
 *
 * - `scheduledPublishAt` set → row flips to `SCHEDULED`, a delayed
 *   `youtube-publish` job is enqueued via `enqueuePublishJob`, and we
 *   return the updated row immediately. The worker startup-recovery
 *   pass picks the job up even if the API / worker was offline at
 *   the scheduled time (cerebrum 2026-06-27).
 * - `scheduledPublishAt` omitted → delegates to `publishVideoNow` for
 *   the synchronous YouTube upload path. Same code path as the
 *   previously-unused `publishVideoNow` — we keep that helper as the
 *   authoritative "publish now" implementation so the two callers
 *   can't drift on YouTube-thumbnail sequencing.
 *
 * Status guard: `READY_FOR_REVIEW` or `PUBLISH_FAILED` only. Publishing
 * a `PUBLISHED` row would be a silent YouTube state change with no
 * UI affordance to reverse it (unpublish is the explicit reversal —
 * an auto-republish would skip that safety), and publishing any
 * earlier status would race with the pipeline workers that own those
 * rows.
 */
export const publishVideo = async (
  userId: string,
  videoId: string,
  input: PublishVideoInput,
  env: Env,
): Promise<Video> => {
  requireDatabase();
  const existing = await loadVideoForOwner(userId, videoId);
  if (existing.status !== "READY_FOR_REVIEW" && existing.status !== "PUBLISH_FAILED") {
    throw new AppError(
      409,
      "NOT_PUBLISHABLE",
      "Video can't be published from its current status.",
    );
  }

  if (input.scheduledPublishAt) {
    // Scheduled path — flip the row, enqueue a delayed job, return the
    // updated DTO. The job itself runs from the worker, which picks
    // up the row's status + metadata via `buildStatusFromVideo`.
    const scheduledPublishAt = new Date(input.scheduledPublishAt);
    const updated = await prisma.video.update({
      where: { id: videoId },
      data: { status: "SCHEDULED", scheduledPublishAt },
    });
    await enqueuePublishJob(videoId, scheduledPublishAt, env);
    return toVideoDto(updated);
  }

  // Immediate path — delegate to the existing sync helper.
  return publishVideoNow(userId, videoId, env);
};

// ---------- internal helpers ----------

const loadPendingUploadForOwner = async (
  userId: string,
  pendingUploadId: string,
): Promise<PendingUpload> => {
  const raw = await cache.get(`${PENDING_UPLOAD_KEY_PREFIX}${pendingUploadId}`);
  if (!raw) {
    // Same shape of 404 the old code used for unknown committed videos —
    // hides whether the id ever existed or just expired.
    throw new AppError(
      404,
      "UPLOAD_NOT_FOUND",
      "Your upload didn't reach storage. Please try again.",
    );
  }
  let pending: PendingUpload;
  try {
    pending = JSON.parse(raw) as PendingUpload;
  } catch {
    // Corrupt entry — treat as missing.
    throw new AppError(
      404,
      "UPLOAD_NOT_FOUND",
      "Your upload didn't reach storage. Please try again.",
    );
  }
  if (pending.userId !== userId) {
    // Don't reveal that the id exists for another user.
    throw new AppError(
      404,
      "UPLOAD_NOT_FOUND",
      "Your upload didn't reach storage. Please try again.",
    );
  }
  return pending;
};

const loadVideoForOwner = async (userId: string, videoId: string) => {
  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video) {
    throw new AppError(404, "VIDEO_NOT_FOUND", "Video not found.");
  }
  if (video.userId !== userId) {
    // Treat foreign-id as not-found to avoid leaking existence.
    throw new AppError(404, "VIDEO_NOT_FOUND", "Video not found.");
  }
  return video;
};

const buildS3Client = (env: Env) => ({
  config: buildS3Config(env),
  client: getS3Client(buildS3Config(env)),
});

const inferExtension = (filename: string, contentType: string): string => {
  const fromName = filename.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (contentType === "video/mp4") return "mp4";
  if (contentType === "video/quicktime") return "mov";
  if (contentType === "video/webm") return "webm";
  return "bin";
};

/**
 * Same shape as `inferExtension`, narrower to image types. GIF is
 * intentionally omitted because the API only accepts JPEG/PNG (see
 * `videos.schemas.ts → thumbnailContentTypeSchema`); a `.gif` from
 * the filename still maps to `image/jpeg` if the content type says
 * so, which is the common case.
 */
const inferThumbnailExtension = (
  filename: string,
  contentType: string,
): string => {
  const fromName = filename.split(".").pop()?.toLowerCase();
  if (fromName && /^(jpg|jpeg|png)$/.test(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  return "bin";
};

const formatBytes = (n: number): string => {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)}GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)}MB`;
  return `${n}B`;
};

/**
 * Minimal pino-shaped logger used when calling publishVideo from the
 * API (which doesn't have a logger in scope here). Keeps the package's
 * log lines coherent with the worker's logs.
 */
const buildConsoleLogger = (service: string) => pino({ base: { service } });
