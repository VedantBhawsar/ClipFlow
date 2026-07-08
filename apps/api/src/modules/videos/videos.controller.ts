/**
 * Videos controller.
 *
 * Thin HTTP adapters. No cache invalidation here — videos aren't part
 * of the `me:${userId}` / `user:${userId}` bundle that other modules
 * cache, so writes don't need to call `cache.del`. The dashboard reads
 * videos via TanStack Query (`useVideos`) which invalidates on its own.
 *
 * Every response is routed through the centralized envelope helpers
 * (`sendOk`, `sendCreated`, `sendEmpty`). The two inline helpers
 * (`requireUser`, `requireEnv`) now throw `AppError` instead of
 * writing a response directly, so the central error middleware is
 * the only place that emits failure bodies.
 *
 * SSE streaming:
 *   GET /api/videos/stream        → all events for the current user
 *   GET /api/videos/:id/stream    → events for a specific video
 */
import type { Request, Response } from "express";
import type { Env } from "@clipflow/config";
import { sendCreated, sendEmpty, sendOk } from "../../lib/response.js";
import { AppError } from "../../errors/AppError.js";
import { eventBus, type VideoEvent } from "../../lib/events.js";
import { sseWrite } from "../../lib/sse.js";
import * as videosService from "./videos.service.js";
import type {
  CreateVideoInput,
  ListPublishedVideosQuery,
  ListVideosQuery,
  PublishVideoInput,
  UpdateVideoInput,
} from "./videos.schemas.js";
import "../auth/auth.types.js";

/**
 * Resolve the authenticated user id, or throw a 401 that the central
 * error middleware will wrap in the failure envelope.
 */
const requireUser = (req: Request): string => {
  if (!req.user) {
    throw new AppError(401, "UNAUTHENTICATED", "Authentication required.");
  }
  return req.user.id;
};

/**
 * Resolve the request-scoped env, or throw a 500 that the central
 * error middleware will wrap in the failure envelope.
 */
const requireEnv = (req: Request): Env => {
  const env = req.app.get("env") as Env | undefined;
  if (!env) {
    throw new AppError(500, "ENV_UNAVAILABLE", "Server is not configured.");
  }
  return env;
};

/**
 * POST /api/videos
 *
 * Mints a `pendingUploadId` + presigned S3 POST URL. No DB row is
 * created here — that happens in `finalizeUpload` after the API has
 * confirmed the bytes landed in S3.
 */
export const createVideoController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = requireUser(req);
  const env = requireEnv(req);
  const input = req.body as CreateVideoInput;
  const result = await videosService.createVideo(userId, input, env);
  sendCreated(res, result, "Video upload ready.");
};

/**
 * POST /api/videos/pending/:id/upload-url
 *
 * Returns a fresh presigned POST URL for an in-flight upload whose
 * original URL may have expired.
 */
export const getUploadUrlController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = requireUser(req);
  const env = requireEnv(req);
  const id = (req.params as { id?: string }).id;
  if (!id) {
    throw new AppError(400, "INVALID_REQUEST", "Pending upload id is required.");
  }
  const result = await videosService.getUploadUrl(userId, id, env);
  sendOk(res, result, "Upload URL minted.");
};

/**
 * POST /api/videos/pending/:id/finalize
 *
 * Confirms the S3 upload and creates the `Video` row.
 */
export const finalizeVideoController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = requireUser(req);
  const env = requireEnv(req);
  const id = (req.params as { id?: string }).id;
  if (!id) {
    throw new AppError(400, "INVALID_REQUEST", "Pending upload id is required.");
  }
  const result = await videosService.finalizeUpload(userId, id, env);
  sendOk(res, result, "Upload finalized.");
};

/**
 * DELETE /api/videos/pending/:id
 *
 * Cancels an in-flight upload: best-effort S3 delete + cache eviction.
 * Idempotent. Returns 200 with `data: null` so the envelope contract
 * stays uniform across every endpoint.
 */
export const cancelPendingUploadController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = requireUser(req);
  const env = requireEnv(req);
  const id = (req.params as { id?: string }).id;
  if (!id) {
    throw new AppError(400, "INVALID_REQUEST", "Pending upload id is required.");
  }
  await videosService.cancelPendingUpload(userId, id, env);
  sendEmpty(res, "Pending upload cancelled.");
};

/**
 * GET /api/videos?status=...&q=...&page=...&pageSize=...
 *
 * Powering the SSR dashboard (`status=NOT_PUBLISHED`),
 * the dashboard's future search box (any combination of `q` / `page`
 * / `pageSize`), and any future "all videos" admin view
 * (omit `status`).
 *
 * Returns the full paginated envelope (`videos + total + page +
 * pageSize + totalPages`) so the client doesn't need a second
 * round-trip to know how many pages exist.
 */
export const listVideosController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = requireUser(req);
  // The validate middleware has already parsed `req.query` through
  // `listVideosQuerySchema` (with its transforms that turn string
  // query params into numbers). `req.query`'s static type is still
  // `ParsedQs`, so we cast through `unknown` to land on the parsed
  // shape without an `as any`.
  const query = (req.query ?? {}) as unknown as ListVideosQuery;
  const result = await videosService.listVideos(userId, query);
  sendOk(res, result, "Videos retrieved.");
};

/**
 * GET /api/videos/published?q=...&page=...&pageSize=...
 *
 * Powers the `/dashboard/published` page. Distinct path rather than
 * `?status=PUBLISHED` so the wire contract and ordering
 * (`publishedAt desc`) stay explicit — a future PUBLISHED-only join
 * (e.g. synced stats) can land here without touching the generic
 * list path.
 *
 * Accepts the same `q` / `page` / `pageSize` filters as the generic
 * list endpoint so the published page can host the same search +
 * pagination UX without duplicating the schema.
 */
export const listPublishedVideosController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = requireUser(req);
  // Same `ParsedQs` → parsed shape cast as `listVideosController`
  // — see the comment there for the rationale.
  const query = (req.query ?? {}) as unknown as ListPublishedVideosQuery;
  const result = await videosService.listPublishedVideos(userId, query);
  sendOk(res, result, "Published videos retrieved.");
};

/**
 * GET /api/videos/:id
 */
export const getVideoController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = requireUser(req);
  const env = requireEnv(req);
  const id = (req.params as { id?: string }).id;
  if (!id) {
    throw new AppError(400, "INVALID_REQUEST", "Video id is required.");
  }
  const result = await videosService.getVideo(userId, id, env);
  sendOk(res, result, "Video retrieved.");
};

/**
 * PATCH /api/videos/:id
 *
 * In-place update of the video metadata + chapters during the review
 * window. Service enforces `status === READY_FOR_REVIEW`; anything else
 * gets a 409 `NOT_EDITABLE` from the central error middleware.
 */
export const updateVideoController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = requireUser(req);
  const id = (req.params as { id?: string }).id;
  if (!id) {
    throw new AppError(400, "INVALID_REQUEST", "Video id is required.");
  }
  const input = req.body as UpdateVideoInput;
  const result = await videosService.updateVideo(userId, id, input);
  sendOk(res, result, "Video updated.");
};

/**
 * GET /api/videos/:id/playback-url
 *
 * Returns a short-lived presigned S3 GET URL for streaming the
 * original video in the browser. The frontend uses this as the
 * `src` of a `<video>` element.
 */
export const getPlaybackUrlController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = requireUser(req);
  const env = requireEnv(req);
  const id = (req.params as { id?: string }).id;
  if (!id) {
    throw new AppError(400, "INVALID_REQUEST", "Video id is required.");
  }
  const result = await videosService.getPlaybackUrl(userId, id, env);
  sendOk(res, result, "Playback URL minted.");
};

/**
 * DELETE /api/videos/:id
 */
export const deleteVideoController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = requireUser(req);
  const env = requireEnv(req);
  const id = (req.params as { id?: string }).id;
  if (!id) {
    throw new AppError(400, "INVALID_REQUEST", "Video id is required.");
  }
  await videosService.deleteVideo(userId, id, env);
  sendEmpty(res, "Video deleted.");
};

/**
 * POST /api/videos/:id/publish
 *
 * User-driven publish trigger from the video detail page. Empty body
 * = publish immediately; `scheduledPublishAt` ISO 8601 in the body =
 * schedule for that instant. The service dispatches to the
 * `publishVideoNow` helper (sync YouTube upload) or the
 * `enqueuePublishJob` path (delayed BullMQ job) accordingly.
 *
 * Service-level guards:
 *   - 404 `VIDEO_NOT_FOUND` for unknown / foreign id (via
 *     `loadVideoForOwner`).
 *   - 409 `NOT_PUBLISHABLE` when the row isn't in `READY_FOR_REVIEW`
 *     or `PUBLISH_FAILED`.
 *   - 400 for malformed `scheduledPublishAt` (not ISO 8601, in the
 *     past, <15 min out, >60 days out).
 */
export const publishVideoController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = requireUser(req);
  const env = requireEnv(req);
  const id = (req.params as { id?: string }).id;
  if (!id) {
    throw new AppError(400, "INVALID_REQUEST", "Video id is required.");
  }
  const input = (req.body ?? {}) as PublishVideoInput;
  const result = await videosService.publishVideo(userId, id, input, env);
  sendOk(res, result, "Video published.");
};

/**
 * POST /api/videos/:id/unpublish
 *
 * Flips a live video's `privacyStatus` back to `private` on YouTube
 * and mirrors the change on the row. Returns the updated DTO so the
 * client can refresh its local view without a follow-up GET.
 *
 * 404 for unknown / foreign id (consistent with the rest of the
 * module). 409 surfaces from `unpublishVideo` via
 * `PermanentPublishError` with code `VIDEO_NOT_PUBLISHED`.
 */
export const unpublishVideoController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = requireUser(req);
  const env = requireEnv(req);
  const id = (req.params as { id?: string }).id;
  if (!id) {
    throw new AppError(400, "INVALID_REQUEST", "Video id is required.");
  }
  const result = await videosService.unpublishVideo(userId, id, env);
  sendOk(res, result, "Video unpublished.");
};

/**
 * POST /api/videos/:id/retry
 *
 * User-driven retry for a video that exhausted all of BullMQ's
 * retries (e.g. permanent FFmpeg error, upstream out-of-credits).
 * Resets the row to `EXTRACTING` and re-enqueues the ingest job.
 *
 * Service-level guards:
 *   - 404 `VIDEO_NOT_FOUND` for unknown / foreign id (via
 *     `loadVideoForOwner`).
 *   - 409 `NOT_RETRYABLE` when the row isn't in `FAILED`. A
 *     `PUBLISH_FAILED` row is retried via `POST /publish`, not here.
 */
export const retryVideoController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = requireUser(req);
  const env = requireEnv(req);
  const id = (req.params as { id?: string }).id;
  if (!id) {
    throw new AppError(400, "INVALID_REQUEST", "Video id is required.");
  }
  const result = await videosService.retryVideo(userId, id, env);
  sendOk(res, result, "Video retry queued.");
};

/**
 * GET /api/videos/stream
 *
 * Opens an SSE connection that streams all video processing events
 * for the authenticated user. Sends a heartbeat every 30 s to keep
 * proxies from closing the connection. Cleans up on client disconnect.
 */
export const streamUserVideosController = (
  req: Request,
  res: Response,
): void => {
  const userId = requireUser(req);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Send initial connection event
  sseWrite(res, "connected", JSON.stringify({ userId }));

  // Subscribe to user-level event bus
  const unsubscribe = eventBus.subscribe(userId, null, (event: VideoEvent) => {
    sseWrite(res, event.type.toLowerCase(), JSON.stringify(event));
  });

  // Heartbeat every 30 s
  const heartbeat = setInterval(() => {
    sseWrite(res, "heartbeat", JSON.stringify({ ts: Date.now() }));
  }, 30_000);

  // Clean up on client disconnect
  req.on("close", () => {
    unsubscribe();
    clearInterval(heartbeat);
  });
};

/**
 * GET /api/videos/:id/stream
 *
 * Opens an SSE connection that streams events for a specific video.
 * Verifies the user owns the video before opening the stream.
 */
export const streamVideoController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const userId = requireUser(req);
  const env = requireEnv(req);
  const videoId = (req.params as { id?: string }).id;
  if (!videoId) {
    throw new AppError(400, "INVALID_REQUEST", "Video id is required.");
  }

  // Verify ownership before streaming. We don't need the DTO back
  // here — the SSE handler owns its own envelope — but the
  // ownership check still has to run, and throwing inside the
  // service is what enforces it.
  await videosService.getVideo(userId, videoId, env);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  sseWrite(res, "connected", JSON.stringify({ videoId, userId }));

  const unsubscribe = eventBus.subscribe(userId, videoId, (event: VideoEvent) => {
    sseWrite(res, event.type.toLowerCase(), JSON.stringify(event));
  });

  const heartbeat = setInterval(() => {
    sseWrite(res, "heartbeat", JSON.stringify({ ts: Date.now() }));
  }, 30_000);

  req.on("close", () => {
    unsubscribe();
    clearInterval(heartbeat);
  });
};