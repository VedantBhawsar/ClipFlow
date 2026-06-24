/**
 * YouTube Data API v3 — two-step resumable upload for videos.insert.
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
 *   status:  { privacyStatus, publishAt?, selfDeclaredMadeForKids: false }
 *
 * `publishAt` is YouTube's native mechanism for scheduled publish —
 * YouTube auto-transitions to public at that wall-clock time. We only
 * pass it for scheduled videos; immediate publishes omit it.
 */
import {
  isTransientHttpStatus,
  PermanentPublishError,
  TransientPublishError,
} from "./errors.js";

const YOUTUBE_UPLOAD_ENDPOINT =
  "https://www.googleapis.com/upload/youtube/v3/videos";

export interface VideoMetadataInput {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
}

export interface VideoStatusInput {
  privacyStatus: "private" | "unlisted" | "public";
  /** ISO8601 string. Omit for immediate publish. */
  publishAt?: string;
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
          status: {
            privacyStatus: input.status.privacyStatus,
            ...(input.status.publishAt ? { publishAt: input.status.publishAt } : {}),
            selfDeclaredMadeForKids: false,
          },
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
 * Classify a metadata-rejection error into a permanent reason code so
 * the UI can render a meaningful message.
 */
const classifyMetadataError = (body: string): "QUOTA_EXCEEDED" | "INVALID_METADATA" | "FORBIDDEN" => {
  if (/quotaExceeded|quota/i.test(body)) return "QUOTA_EXCEEDED";
  if (/invalid|required|missing/i.test(body)) return "INVALID_METADATA";
  return "FORBIDDEN";
};