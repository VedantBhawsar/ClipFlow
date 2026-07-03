/**
 * TanStack Query hooks + an XHR-based upload helper for the
 * upload → publish flow.
 *
 * Why an XHR for the upload (and not `fetch`): `fetch` doesn't expose
 * upload-progress events in the browser. XMLHttpRequest does, and the
 * two-step presigned POST flow (create → upload → finalize) wants a
 * progress bar so the user can see the file moving.
 *
 * `useUploadVideo` is intentionally NOT a hook — it returns a plain
 * async function plus an `AbortController` so the consuming component
 * can drive both progress reporting and cancellation without the
 * hook lifecycle getting in the way.
 */
"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateVideoRequest,
  CreateVideoResponse,
  ListPublishedVideosParams,
  ListVideosParams,
  PaginatedVideos,
  PublishVideoRequest,
  UpdateVideoRequest,
  Video,
} from "@clipflow/types";

import { useApi } from "@/hooks/use-api";
import { queryKeys } from "@/lib/query-keys";

/**
 * List the current user's committed videos, paginated.
 *
 * The optional `params` argument is folded into the query key (see
 * `queryKeys.videos.list`) so distinct filter tuples produce
 * distinct cache slots — the dashboard's "non-published, page 1"
 * query and a future admin view's "all videos, page 1" can both
 * live in the cache at once.
 *
 * Returns the full paginated envelope (`videos + total + page +
 * pageSize + totalPages`) — not a bare array — so the API surface
 * stays consistent across `list` / `get` / etc. and consumers
 * don't have to special-case "is this paginated".
 *
 * Note: pending uploads (in-flight, no row yet) are NOT included.
 * They live in the upload dialog's local state and only appear on the
 * dashboard after the row is committed by `finalizeUpload`.
 *
 * `enabled: !!api` gates the query on a session existing — without
 * this it would fire without an Authorization header, get 401'd,
 * trip the SessionExpiredError global handler, and redirect-loop.
 */
export function useVideos(params?: ListVideosParams) {
  const api = useApi();
  return useQuery<PaginatedVideos>({
    queryKey: queryKeys.videos.list(params ?? {}),
    queryFn: () => api.listVideos(params),
    enabled: !!api,
  });
}

/**
 * Step 1 of the upload flow: mint a `pendingUploadId` and a presigned
 * S3 POST URL. **No row is created server-side** at this point; the
 * returned `pendingUploadId` is the handle for the in-flight upload.
 */
export function useCreateVideo() {
  const api = useApi();
  return useMutation<CreateVideoResponse, Error, CreateVideoRequest>({
    mutationFn: (body) => api.createVideo(body),
  });
}

/**
 * Step 3 of the upload flow: notify the API that the browser has
 * finished uploading to S3. The API HEADs the object, validates the
 * size, and only then creates the `Video` row. Invalidates every
 * videos-list cache slot (any filter / page) so the dashboard
 * re-fetches and the new row appears.
 */
export function useFinalizeUpload() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation<Video, Error, string>({
    mutationFn: (pendingUploadId) => api.finalizeUpload(pendingUploadId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["videos", "list"] });
    },
  });
}

/**
 * Cancel an in-flight upload: best-effort S3 delete + cache eviction
 * server-side. Idempotent. The dialog calls this when the user clicks
 * "Cancel" during a failed upload so the partial S3 object and the
 * server-side pending-upload metadata don't leak.
 */
export function useCancelPendingUpload() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (pendingUploadId) => api.cancelPendingUpload(pendingUploadId),
    onSuccess: () => {
      // A row never existed for a cancelled pending upload, so
      // invalidating the list is just defensive. The dialog closes
      // immediately on success.
      void qc.invalidateQueries({ queryKey: ["videos", "list"] });
    },
  });
}

/**
 * Delete (cancel) a committed, not-yet-published video. The row exists
 * at this point, so the list query needs invalidation across every
 * filter / page slot.
 */
export function useDeleteVideo() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api.deleteVideo(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["videos", "list"] });
    },
  });
}

/**
 * List the current user's PUBLISHED videos, paginated. Powers the
 * `/dashboard/published` page. Accepts the same `q` / `page` /
 * `pageSize` filters as the generic list endpoint so the published
 * page can host the same search + pagination UX without duplicating
 * the schema.
 *
 * Always filtered to `status: "PUBLISHED"` server-side; the
 * `publishedAt desc` ordering is a hard contract for this endpoint.
 */
export function useListPublishedVideos(
  params?: ListPublishedVideosParams,
  options?: { placeholderData?: typeof keepPreviousData },
) {
  const api = useApi();
  return useQuery<PaginatedVideos>({
    queryKey: queryKeys.videos.published(params ?? {}),
    queryFn: () => api.listPublishedVideos(params),
    enabled: !!api,
    ...(options?.placeholderData
      ? { placeholderData: options.placeholderData }
      : {}),
  });
}

/**
 * Unpublish a live video. Invalidates every videos-list and
 * videos-published cache slot (any filter / page) so any open view
 * re-fetches. The row's `privacyStatus` flipped to `private`, but it
 * remains in the published list until a future slice distinguishes
 * the two — for now we just invalidate so any open views refetch.
 */
export function useUnpublishVideo() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation<Video, Error, string>({
    mutationFn: (id) => api.unpublishVideo(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["videos", "published"] });
      void qc.invalidateQueries({ queryKey: ["videos", "list"] });
    },
  });
}

/**
 * Publish a `READY_FOR_REVIEW` (or `PUBLISH_FAILED` retry) video.
 * Empty `body` publishes immediately; a `scheduledPublishAt` ISO
 * 8601 string schedules the row and enqueues a delayed BullMQ job.
 *
 * On success, invalidates the same slots as `useUpdateVideo`:
 *   - the full videos list (so the dashboard re-renders the row's
 *     new status — `PUBLISHING` immediately, `PUBLISHED` once the
 *     worker resolves),
 *   - the published page (so the row appears in the published list
 *     once it actually goes live),
 *   - the single-video detail slot (so the in-flight detail page
 *     re-fetches its new status).
 *
 * The Publish sheet is responsible for the post-success navigation
 * (`router.push("/dashboard/published")`); the hook itself only
 * touches the cache, so a future caller that wants to keep the user
 * on the detail page (e.g. an inline "Publish now" button) can use
 * the same hook without inheriting the redirect.
 */
export function usePublishVideo() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation<
    Video,
    Error,
    { id: string; body?: PublishVideoRequest }
  >({
    mutationFn: ({ id, body }) => api.publishVideo(id, body),
    onSuccess: (video) => {
      void qc.invalidateQueries({ queryKey: ["videos", "list"] });
      void qc.invalidateQueries({ queryKey: ["videos", "published"] });
      void qc.invalidateQueries({ queryKey: queryKeys.videos.detail(video.id) });
    },
  });
}

/**
 * In-place editor save. PATCHes the video row with the fields the user
 * changed in the review screen. On success we invalidate every cache
 * slot that could show the row — list, published, and the single-video
 * detail — so any open view re-fetches.
 *
 * The hook is intentionally narrow: it accepts the full
 * `UpdateVideoRequest` payload (the service does the partial-merge),
 * so a per-section Save button in the editor can call this with
 * whichever subset of fields that section owns.
 */
export function useUpdateVideo() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation<Video, Error, { id: string; body: UpdateVideoRequest }>({
    mutationFn: ({ id, body }) => api.updateVideo(id, body),
    onSuccess: (video) => {
      void qc.invalidateQueries({ queryKey: ["videos", "list"] });
      void qc.invalidateQueries({ queryKey: ["videos", "published"] });
      void qc.invalidateQueries({ queryKey: queryKeys.videos.detail(video.id) });
    },
  });
}

export interface UploadProgress {
  loaded: number;
  total: number;
}

export interface UploadHandle {
  /** Promise that resolves when the upload finishes. */
  promise: Promise<void>;
  /** Abort the in-flight upload. */
  abort: () => void;
}

/**
 * Step 2 of the upload flow: PUT the file to the presigned S3 URL
 * with progress reporting. NOT a hook — returns a function that builds
 * an `UploadHandle`. The component drives the lifecycle so it can
 * cancel on unmount and re-issue on Re-upload without re-picking the
 * file.
 *
 * The same function works for the initial upload and for Re-upload —
 * Re-upload just calls it again with the same `presigned` payload
 * (which may have been refreshed via `api.getUploadUrl` if the original
 * URL expired in the meantime).
 */
export function useUploadVideo() {
  return function uploadVideo(
    file: File,
    presigned: CreateVideoResponse,
    onProgress: (p: UploadProgress) => void,
  ): UploadHandle {
    return uploadViaPresignedPost(file, presigned.postUrl, presigned.fields, onProgress);
  };
}

/**
 * Upload the custom thumbnail alongside the video. The browser
 * `PUT`s the image to a second presigned POST URL the API mints in
 * `createVideo`. The returned handle exposes the same `promise` /
 * `abort` shape as the video uploader so the dialog can cancel
 * either mid-flight without special-casing.
 *
 * Returns `null` if the create response didn't include a thumbnail
 * block (user didn't pick one) — the dialog then skips the
 * thumbnail PUT entirely.
 */
export function useUploadThumbnail() {
  return function uploadThumbnail(
    file: File,
    presigned: NonNullable<CreateVideoResponse["thumbnail"]>,
    onProgress?: (p: UploadProgress) => void,
  ): UploadHandle {
    return uploadViaPresignedPost(
      file,
      presigned.postUrl,
      presigned.fields,
      onProgress ?? (() => {}),
    );
  };
}

/**
 * Shared XHR helper for both video and thumbnail uploads. Pulled out
 * so the two wrappers above stay declarative — the dialog only sees
 * "upload a file to this presigned URL with this progress callback".
 */
function uploadViaPresignedPost(
  file: File,
  postUrl: string,
  fields: Record<string, string>,
  onProgress: (p: UploadProgress) => void,
): UploadHandle {
  const xhr = new XMLHttpRequest();
  const controller = new AbortController();

  const promise = new Promise<void>((resolve, reject) => {
    xhr.open("POST", postUrl);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress({ loaded: e.loaded, total: e.total });
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(
          new Error(
            `Upload failed: ${xhr.status} ${xhr.responseText?.slice(0, 200) ?? ""}`,
          ),
        );
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));

    const form = new FormData();
    // The presigned `fields` must come first in the multipart body, in
    // the order the API returned them. `FormData.append` preserves
    // insertion order.
    for (const [k, v] of Object.entries(fields)) {
      form.append(k, v);
    }
    form.append("file", file);

    xhr.send(form);
  });

  return {
    promise,
    abort: () => {
      controller.abort();
      xhr.abort();
    },
  };
}