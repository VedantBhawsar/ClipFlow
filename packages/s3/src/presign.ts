/**
 * Presigned helpers — both upload (POST) and download (GET).
 *
 * Upload: uses `@aws-sdk/s3-presigned-post` (multipart/form-data) so
 * we can attach a `content-length-range` policy and hard-cap the
 * upload at `YOUTUBE_MAX_VIDEO_BYTES`.
 *
 * Download: uses `@aws-sdk/s3-request-presigner` to mint short-lived
 * GET URLs so the browser can stream video / audio directly from S3.
 * The API never proxies bytes.
 */
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
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

/**
 * Mint a short-lived presigned GET URL for reading an S3 object
 * directly from the browser. Used by the video detail page to stream
 * the original file for preview / review.
 *
 * The URL expires after `expiresInSeconds` (default 900 s = 15 min).
 * The browser can use it as the `src` of a `<video>` element.
 *
 * @param client S3 client (from `getS3Client`).
 * @param config S3 config.
 * @param key    Object key to read.
 * @param expiresInSeconds  TTL in seconds (default 900).
 * @param responseContentType  Optional Content-Type override (e.g. for
 *   serving the original video with a browser-friendly MIME type).
 * @returns  Presigned GET URL string.
 */
export const createPresignedGetUrl = async (
  client: S3Client,
  config: S3Config,
  key: string,
  expiresInSeconds = 900,
  responseContentType?: string,
): Promise<string> => {
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ...(responseContentType ? { ResponseContentType: responseContentType } : {}),
  });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
};