/**
 * Module-internal types for the videos module.
 */
import type { Video } from "@clipflow/types";

/**
 * Map a Prisma Video row to the wire DTO.
 *
 * - Dates → ISO strings.
 * - BigInt fileSizeBytes → number (safe; 5GB < 2^53).
 *
 * The parameter type is structural rather than `Prisma.Video` so this
 * stays a leaf import — the service layer doesn't have to thread the
 * generated client through to keep typing tight, and tests can stub
 * rows without standing up the full client surface.
 */
export const toVideoDto = (v: {
  id: string;
  status: string;
  title: string;
  description: string | null;
  tags: string[];
  categoryId: string;
  privacyStatus: string;
  madeForKids: boolean;
  ageRestriction: string;
  embeddable: boolean;
  license: string;
  publicStatsViewable: boolean;
  commentPolicy: string;
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
  madeForKids: v.madeForKids,
  ageRestriction: v.ageRestriction as Video["ageRestriction"],
  embeddable: v.embeddable,
  license: v.license as Video["license"],
  publicStatsViewable: v.publicStatsViewable,
  commentPolicy: v.commentPolicy as Video["commentPolicy"],
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
