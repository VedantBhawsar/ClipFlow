/**
 * Object operations used by the API (finalize, delete) and the worker
 * (stream into the YouTube upload).
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import type { S3Client } from "@aws-sdk/client-s3";
import type { S3Config } from "./client.js";

export interface ObjectHead {
  contentLength: number;
  contentType: string | undefined;
  etag: string | undefined;
}

/**
 * Fetch object metadata. Used by `finalizeUpload` to verify the upload
 * completed and the size is within the cap (defense-in-depth on top of
 * the presigned `content-length-range` policy).
 *
 * @param client S3 client.
 * @param config S3 config.
 * @param key Object key.
 * @returns Metadata, or `null` if the object does not exist.
 */
export const headObject = async (
  client: S3Client,
  config: S3Config,
  key: string,
): Promise<ObjectHead | null> => {
  try {
    const res = await client.send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    return {
      contentLength: res.ContentLength ?? 0,
      contentType: res.ContentType,
      etag: res.ETag,
    };
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })
      ?.$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw err;
  }
};

/**
 * Delete an object. Used by `deleteVideo` and `cancel` paths. Errors
 * are propagated; callers decide whether to swallow them (we treat
 * DB deletion as the source of truth for v1).
 */
export const deleteObject = async (
  client: S3Client,
  config: S3Config,
  key: string,
): Promise<void> => {
  await client.send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
  );
};

/**
 * Get the object body as a Node `Readable` stream + content length.
 * Used by the worker to forward S3 bytes into the YouTube resumable
 * upload (which itself accepts a streaming PUT body via `undici fetch`).
 *
 * @param client S3 client.
 * @param config S3 config.
 * @param key Object key.
 * @returns Body stream and content length.
 */
export const getObjectStream = async (
  client: S3Client,
  config: S3Config,
  key: string,
): Promise<{
  body: NonNullable<GetObjectCommandOutput["Body"]>;
  contentLength: number;
}> => {
  const res = await client.send(
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
  );
  if (!res.Body) {
    throw new Error(
      `S3 GetObject returned no body for key "${key}" (ContentLength=${res.ContentLength ?? "?"})`,
    );
  }
  return { body: res.Body, contentLength: res.ContentLength ?? 0 };
};