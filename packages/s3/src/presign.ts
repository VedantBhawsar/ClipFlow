/**
 * Presigned upload helpers.
 *
 * Uses `@aws-sdk/s3-presigned-post` (multipart/form-data) for browser
 * uploads so we can attach a `content-length-range` policy and
 * hard-cap the upload at `YOUTUBE_MAX_VIDEO_BYTES`. PUT-style presigned
 * URLs cannot encode range policies the same way, so we route the
 * browser through POST-style URLs.
 *
 * The browser:
 *   1. Calls `POST /api/videos` to get `{ id, postUrl, fields }`.
 *   2. Submits a multipart/form-data POST to `postUrl` with `fields`
 *      followed by the `file` part. The browser sets Content-Length on
 *      the multipart body; S3/MinIO rejects if it's outside the range.
 *   3. Calls `POST /api/videos/:id/finalize` once the upload completes.
 */
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import type { S3Client } from "@aws-sdk/client-s3";
import type { S3Config } from "./client.js";

/**
 * Presigned POST result. The browser must submit these `fields` first
 * in the multipart body, then the file as the final part.
 */
export interface PresignedPost {
  /** URL to POST the multipart form to. */
  url: string;
  /** Fields to include in the multipart form (in this order), before the file. */
  fields: Record<string, string>;
  /** Absolute URL the browser should POST to. Convenience alias of {@link url}. */
  postUrl: string;
  /** Maximum bytes accepted by S3 for this upload. */
  contentLengthMaxBytes: number;
}

export interface CreatePresignedPostInput {
  key: string;
  contentType: string;
  contentLengthMaxBytes: number;
  expiresInSeconds?: number;
}

/**
 * Mint a presigned POST URL that accepts a single file upload of
 * `contentType`, bounded by `contentLengthMaxBytes`.
 *
 * @param client S3 client (from `getS3Client`).
 * @param config S3 config.
 * @param input Key, content type, byte cap, optional TTL.
 * @returns Presigned POST payload for the browser.
 */
export const createPresignedPostUrl = async (
  client: S3Client,
  config: S3Config,
  input: CreatePresignedPostInput,
): Promise<PresignedPost> => {
  const { url, fields } = await createPresignedPost(client, {
    Bucket: config.bucket,
    Key: input.key,
    Conditions: [
      ["content-length-range", 0, input.contentLengthMaxBytes],
      ["eq", "$Content-Type", input.contentType],
    ],
    Fields: {
      "Content-Type": input.contentType,
    },
    Expires: input.expiresInSeconds ?? 900,
  });
  return {
    url,
    fields,
    postUrl: url,
    contentLengthMaxBytes: input.contentLengthMaxBytes,
  };
};