/**
 * @clipflow/s3 — public exports.
 */
export {
  buildS3Config,
  getS3Client,
  type S3Config,
} from "./client.js";
export {
  createPresignedPostUrl,
  createPresignedGetUrl,
  type PresignedPost,
  type CreatePresignedPostInput,
} from "./presign.js";
export {
  deleteObject,
  getObjectStream,
  headObject,
  putObjectFromFile,
  type ObjectHead,
} from "./operations.js";