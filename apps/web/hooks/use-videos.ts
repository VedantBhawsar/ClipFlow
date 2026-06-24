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

import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/**
 * List the current user's videos.
 *
 * Returns the wrapped `{ videos: [...] }` payload shape — not a bare
 * array — so the API surface stays consistent across `list` / `get`
 * / etc. and consumers don't have to special-case "is this paginated".
 */
export function useVideos() {
  return useQuery<{ videos: Video[] }>({
    queryKey: queryKeys.videos.list(),
    queryFn: () => api.listVideos(),
  });
}

/**
 * Create a Video row + presigned upload URL.
 */
export function useCreateVideo() {
  return useMutation<CreateVideoResponse, Error, CreateVideoRequest>({
    mutationFn: (body) => api.createVideo(body),
  });
}

/**
 * Finalize an uploaded video (HEADs S3, transitions status, enqueues publish).
 */
export function useFinalizeUpload() {
  const qc = useQueryClient();
  return useMutation<Video, Error, string>({
    mutationFn: (id) => api.finalizeUpload(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.videos.list() });
    },
  });
}

/**
 * Delete (cancel) a not-yet-published video.
 */
export function useDeleteVideo() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api.deleteVideo(id),
    onSuccess: () => {
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
 * Upload a file to a presigned POST URL with progress reporting.
 *
 * NOT a hook — returns a function that builds an `UploadHandle`. The
 * component drives the lifecycle so it can cancel on unmount.
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