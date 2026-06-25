/**
 * YouTube Data API v3 — two-step resumable upload for videos.insert
 * plus a small `videos.update` helper for the unpublish path.
 *
 * Step 1: POST metadata to
 *   https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status
 *   → 200 with a `Location` header containing the resumable session URL.
 *
 * Step 2: PUT the file bytes to that session URL. On success, body
 *   contains `{ id: "<youtubeVideoId>", status: { ... } }`.
 *
 * The metadata shape we send matches `videos.insert`:
 *   snippet: { title, description, tags[], categoryId }
 *   status:  { privacyStatus, publishAt?, selfDeclaredMadeForKids,
 *              ageRestriction, embeddable, license, publicStatsViewable,
 *              commentPolicy }
 *
 * `publishAt` is YouTube's native mechanism for scheduled publish —
 * YouTube auto-transitions to public at that wall-clock time. We only
 * pass it for scheduled videos; immediate publishes omit it.
 *
 * Unpublish path: `PUT /videos?part=status` with the same status block,
 * used to flip a live video's `privacyStatus` back to `private`. Same
 * error-classification rules as the insert path.
 */
import {
  isTransientHttpStatus,
  PermanentPublishError,
  TransientPublishError,
} from "./errors.js";

const YOUTUBE_UPLOAD_ENDPOINT =
  "https://www.googleapis.com/upload/youtube/v3/videos";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3/videos";

export interface VideoMetadataInput {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
}

/**
 * License values the YouTube Data API v3 accepts on `status.license`.
 *
 * NOTE: this is NOT the same as our internal `VideoLicense` enum in
 * `@clipflow/types`, which uses `"standard"` for the default YouTube
 * license. YouTube's enum uses `"youtube"` instead — sending
 * `"standard"` produces a 400 `INVALID_METADATA` rejection. The
 * translation lives in {@link toYouTubeLicense}.
 */
export type YouTubeLicense = "youtube" | "creativeCommon";

/**
 * Map our internal `VideoLicense` value to the YouTube-API enum value.
 *
 * - `"standard"` (internal default) → `"youtube"` (YouTube default).
 * - `"creativeCommon"` → `"creativeCommon"` (no change).
 * - unknown → `"youtube"` (fallback matches YouTube's default for an
 *   unspecified license — keeps the worker from crashing if a future
 *   schema migration introduces a new value before this mapper is
 *   updated).
 *
 * Callers MUST apply this at the YouTube boundary — never send the
 * raw internal value over the wire.
 */
export const toYouTubeLicense = (internal: string): YouTubeLicense => {
  switch (internal) {
    case "creativeCommon":
      return "creativeCommon";
    case "standard":
    default:
      return "youtube";
  }
};

/**
 * Full `status` block for `videos.insert`. Every field maps to a
 * `status.*` property on the row (see `packages/db/schema.prisma`) and
 * has a sensible default that matches YouTube's own defaults, so the
 * API can omit any field the creator didn't touch.
 *
 * Values are kept narrow where the API contract is closed (privacy,
 * license, comment policy) and stored as plain strings where YouTube
 * reserves the right to add new ones (age restriction, which already
 * differs by region).
 */
export interface VideoStatusInput {
  privacyStatus: "private" | "unlisted" | "public";
  /** ISO8601 string. Omit for immediate publish. */
  publishAt?: string;
  /** COPPA self-declaration. Once true, can only be unset via Studio. */
  selfDeclaredMadeForKids: boolean;
  /** "none" (default) | "18+" — kept as string so future values are
   *  additive without a package change. */
  ageRestriction: string;
  /** Allow other sites to embed this video. */
  embeddable: boolean;
  /** YouTube-API enum value. Use {@link toYouTubeLicense} to translate
   *  from our internal `VideoLicense`. */
  license: YouTubeLicense;
  /** Show the public view count on the watch page. */
  publicStatsViewable: boolean;
  /** "allowAll" | "holdAll" | "disable". */
  commentPolicy: string;
}

export interface StartResumableUploadInput {
  accessToken: string;
  metadata: VideoMetadataInput;
  status: VideoStatusInput;
  contentLength: number;
  contentType: string;
}

/**
 * Step 1: ask YouTube for a resumable upload session. Returns the
 * session URL from the `Location` response header.
 *
 * @throws TransientPublishError on 5xx / 408 / 429 / network.
 * @throws PermanentPublishError on other 4xx.
 */
export const startResumableUploadSession = async (
  input: StartResumableUploadInput,
): Promise<string> => {
  let res: Response;
  try {
    res = await fetch(
      `${YOUTUBE_UPLOAD_ENDPOINT}?uploadType=resumable&part=snippet,status`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": input.contentType,
          "X-Upload-Content-Length": String(input.contentLength),
        },
        body: JSON.stringify({
          snippet: input.metadata,
          status: buildStatusBlock(input.status),
        }),
      },
    );
  } catch (err) {
    throw new TransientPublishError(
      `Network failure starting YouTube resumable upload: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (isTransientHttpStatus(res.status)) {
      throw new TransientPublishError(
        `YouTube start-resumable transient failure (${res.status}): ${body.slice(0, 200)}`,
        res.status,
      );
    }
    const reason = classifyMetadataError(body);
    throw new PermanentPublishError(
      reason,
      `YouTube rejected video metadata (${res.status}): ${body.slice(0, 300)}`,
      res.status,
    );
  }

  const location = res.headers.get("Location");
  if (!location) {
    throw new PermanentPublishError(
      "MALFORMED_RESPONSE",
      "YouTube did not return a Location header for the resumable session.",
    );
  }
  return location;
}

export interface UploadBytesInput {
  sessionUrl: string;
  /** Stream of bytes (Node Readable). */
  body: ReadableStream<Uint8Array> | import("node:stream").Readable;
  contentLength: number;
  contentType: string;
}

export interface UploadedVideo {
  youtubeVideoId: string;
  status: { privacyStatus: string; uploadStatus?: string };
}

/**
 * Step 2: PUT the video bytes to the resumable session URL. Returns
 * the new YouTube video id and the reported status.
 *
 * @throws TransientPublishError on 5xx / 408 / 429 / network.
 * @throws PermanentPublishError on other 4xx.
 */
export const uploadVideoBytes = async (
  input: UploadBytesInput,
): Promise<UploadedVideo> => {
  let res: Response;
  try {
    res = await fetch(input.sessionUrl, {
      method: "PUT",
      headers: {
        "Content-Type": input.contentType,
        "Content-Length": String(input.contentLength),
      },
      body: input.body as unknown as BodyInit,
      // @ts-expect-error -- undici's duplex option for streaming bodies
      duplex: "half",
    });
  } catch (err) {
    throw new TransientPublishError(
      `Network failure uploading YouTube bytes: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (isTransientHttpStatus(res.status)) {
      throw new TransientPublishError(
        `YouTube upload-bytes transient failure (${res.status}): ${body.slice(0, 200)}`,
        res.status,
      );
    }
    throw new PermanentPublishError(
      "FORBIDDEN",
      `YouTube rejected video upload (${res.status}): ${body.slice(0, 300)}`,
      res.status,
    );
  }

  const data = (await res.json()) as {
    id: string;
    status?: { privacyStatus: string; uploadStatus?: string };
  };

  if (!data?.id) {
    throw new PermanentPublishError(
      "MALFORMED_RESPONSE",
      "YouTube upload succeeded but returned no video id.",
    );
  }

  return {
    youtubeVideoId: data.id,
    status: data.status ?? { privacyStatus: "private" },
  };
};

/**
 * `PUT /videos?part=status` — update an existing video's status block.
 * Used today by the unpublish path (privacyStatus = private); the
 * shape of the body is the same status block used at insert time so
 * any future status-only edit (license flip, comments off, etc.) can
 * reuse this helper without a new endpoint.
 *
 * @throws TransientPublishError on 5xx / 408 / 429 / network.
 * @throws PermanentPublishError on other 4xx.
 */
export const updateVideoStatus = async (
  accessToken: string,
  videoId: string,
  status: VideoStatusInput,
): Promise<void> => {
  let res: Response;
  try {
    res = await fetch(`${YOUTUBE_API_BASE}?part=status`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        id: videoId,
        status: buildStatusBlock(status),
      }),
    });
  } catch (err) {
    throw new TransientPublishError(
      `Network failure updating YouTube video status: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (isTransientHttpStatus(res.status)) {
      throw new TransientPublishError(
        `YouTube status update transient failure (${res.status}): ${body.slice(0, 200)}`,
        res.status,
      );
    }
    throw new PermanentPublishError(
      "FORBIDDEN",
      `YouTube rejected status update (${res.status}): ${body.slice(0, 300)}`,
      res.status,
    );
  }
};

/**
 * Shape the `status` block the Data API expects. `publishAt` is
 * included only when set, since YouTube rejects an explicit `publishAt`
 * in the past on a non-private video.
 */
const buildStatusBlock = (input: VideoStatusInput): Record<string, unknown> => {
  const block: Record<string, unknown> = {
    privacyStatus: input.privacyStatus,
    selfDeclaredMadeForKids: input.selfDeclaredMadeForKids,
    ageRestriction: input.ageRestriction,
    embeddable: input.embeddable,
    license: input.license,
    publicStatsViewable: input.publicStatsViewable,
    commentPolicy: input.commentPolicy,
  };
  if (input.publishAt) {
    block.publishAt = input.publishAt;
  }
  return block;
};

/**
 * Classify a metadata-rejection error into a permanent reason code so
 * the UI can render a meaningful message.
 */
const classifyMetadataError = (body: string): "QUOTA_EXCEEDED" | "INVALID_METADATA" | "FORBIDDEN" => {
  if (/quotaExceeded|quota/i.test(body)) return "QUOTA_EXCEEDED";
  if (/invalid|required|missing/i.test(body)) return "INVALID_METADATA";
  return "FORBIDDEN";
};
