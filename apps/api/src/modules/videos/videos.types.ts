/**
 * Module-internal types for the videos module.
 */
import type { Video } from "@clipflow/types";

/**
 * Map a Prisma Video row to the wire DTO.
 *
 * - Dates → ISO strings.
 * - BigInt fileSizeBytes → number (safe; 5GB < 2^53).
 */
export const toVideoDto = (v: {
  id: string;
  status: string;
  title: string;
  description: string | null;
  tags: string[];
  categoryId: string;
  privacyStatus: string;
  originalFilename: string;
  fileSizeBytes: bigint;
  contentType: string;
  s3KeyOriginal: string;
  failureReason: string | null;
  scheduledPublishAt: Date | null;
  youtubeVideoId: string | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}): Video => ({
  id: v.id,
  status: v.status as Video["status"],
  title: v.title,
  description: v.description,
  tags: v.tags,
  categoryId: v.categoryId,
  privacyStatus: v.privacyStatus,
  originalFilename: v.originalFilename,
  fileSizeBytes: Number(v.fileSizeBytes),
  contentType: v.contentType,
  s3KeyOriginal: v.s3KeyOriginal,
  failureReason: v.failureReason,
  scheduledPublishAt: v.scheduledPublishAt?.toISOString() ?? null,
  youtubeVideoId: v.youtubeVideoId,
  createdAt: v.createdAt.toISOString(),
  updatedAt: v.updatedAt.toISOString(),
  publishedAt: v.publishedAt?.toISOString() ?? null,
});