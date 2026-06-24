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

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateVideoRequest,
  CreateVideoResponse,
  Video,
} from "@clipflow/types";

import { useApi } from "@/hooks/use-api";
import { queryKeys } from "@/lib/query-keys";

/**
 * List the current user's committed videos.
 *
 * Returns the wrapped `{ videos: [...] }` payload shape — not a bare
 * array — so the API surface stays consistent across `list` / `get`
 * / etc. and consumers don't have to special-case "is this paginated".
 *
 * Note: pending uploads (in-flight, no row yet) are NOT included.
 * They live in the upload dialog's local state and only appear on the
 * dashboard after the row is committed by `finalizeUpload`.
 *
 * `enabled: !!api` gates the query on a session existing — without
 * this it would fire without an Authorization header, get 401'd,
 * trip the SessionExpiredError global handler, and redirect-loop.
 */
export function useVideos() {
  const api = useApi();
  return useQuery<{ videos: Video[] }>({
    queryKey: queryKeys.videos.list(),
    queryFn: () => api.listVideos(),
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
 * size, and only then creates the `Video` row. Invalidates the videos
 * list so the dashboard re-fetches and the new row appears.
 */
export function useFinalizeUpload() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation<Video, Error, string>({
    mutationFn: (pendingUploadId) => api.finalizeUpload(pendingUploadId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.videos.list() });
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
      void qc.invalidateQueries({ queryKey: queryKeys.videos.list() });
    },
  });
}

/**
 * Delete (cancel) a committed, not-yet-published video. The row exists
 * at this point, so the list query needs invalidation.
 */
export function useDeleteVideo() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api.deleteVideo(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.videos.list() });
    },
  });
}

/**
 * List the current user's PUBLISHED videos, newest published first.
 * Powers the `/dashboard/published` page (its server component is
 * the SSR source of truth; this hook is for any client-driven
 * refresh, e.g. after a successful unpublish from the detail page).
 */
export function useListPublishedVideos() {
  const api = useApi();
  return useQuery<{ videos: Video[] }>({
    queryKey: queryKeys.videos.published(),
    queryFn: () => api.listPublishedVideos(),
    enabled: !!api,
  });
}

/**
 * Unpublish a live video. Invalidates the published list (the row's
 * `privacyStatus` flipped to `private`, but it remains in the
 * published list until a future slice distinguishes the two — for
 * now we just invalidate so any open views refetch).
 */
export function useUnpublishVideo() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation<Video, Error, string>({
    mutationFn: (id) => api.unpublishVideo(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.videos.published() });
      void qc.invalidateQueries({ queryKey: queryKeys.videos.list() });
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
    const xhr = new XMLHttpRequest();
    const controller = new AbortController();

    const promise = new Promise<void>((resolve, reject) => {
      xhr.open("POST", presigned.postUrl);
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
      for (const [k, v] of Object.entries(presigned.fields)) {
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
  };
}