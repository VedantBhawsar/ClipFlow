/**
 * @clipflow/s3
 *
 * S3 client factory + config used by both apps/api (presign upload
 * URLs, head/delete operations) and apps/worker (stream videos into
 * the YouTube upload).
 *
 * The same client works against AWS S3, MinIO (local Docker), and
 * Cloudflare R2 — only S3_ENDPOINT and S3_FORCE_PATH_STYLE differ.
 * MinIO requires `forcePathStyle: true` because it does not support
 * virtual-hosted-style bucket subdomains.
 */
import { S3Client } from "@aws-sdk/client-s3";
import type { Env } from "@clipflow/config";

/**
 * Static config derived from env. Build once, pass to the helpers.
 */
export interface S3Config {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle: boolean;
}

/**
 * Build an {@link S3Config} from the validated env.
 *
 * @param env Validated env from `@clipflow/config`.
 * @returns Config object suitable for {@link getS3Client}.
 */
export const buildS3Config = (env: Env): S3Config => ({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  accessKeyId: env.S3_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  bucket: env.S3_BUCKET,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
});

/**
 * Memoized S3 client. Same config object returns the same instance so
 * both API and worker processes don't accidentally create dozens of
 * underlying TCP connections during a single upload.
 */
const clientCache = new WeakMap<S3Config, S3Client>();

/**
 * Get an {@link S3Client} for the given config.
 *
 * @param config S3Config.
 * @returns S3 client.
 */
export const getS3Client = (config: S3Config): S3Client => {
  const cached = clientCache.get(config);
  if (cached) return cached;
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  clientCache.set(config, client);
  return client;
};