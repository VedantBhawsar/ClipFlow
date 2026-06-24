/**
 * Zod schemas for the videos module.
 *
 * Mirrors the bounds YouTube enforces on its own videos.insert payload
 * so we reject bad metadata server-side before enqueueing.
 */
import { z } from "zod";

/**
 * Committed video ids are minted server-side as `vid_<uuid>` (see
 * `videos.service.ts → finalizeUpload`). We validate the full prefixed
 * shape here so a malformed id fails fast at the edge with 400 instead
 * of reaching Prisma's `findUnique` and surfacing as a confusing 404.
 */
const VIDEO_ID_REGEX =
  /^vid_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const videoIdParamsSchema = z.object({
  id: z.string().regex(VIDEO_ID_REGEX, "Invalid video id."),
});

/**
 * Pending upload ids are minted by `createVideo` and used to track an
 * in-flight S3 upload until the browser calls `finalize`. The shape
 * matches `videoIdParamsSchema`'s structure (caller's `:id` URL param)
 * but uses the `pu_` prefix so a route that expects a committed video
 * can't accidentally accept an in-flight id (or vice versa).
 */
const PENDING_UPLOAD_ID_REGEX =
  /^pu_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const pendingUploadIdParamsSchema = z.object({
  id: z.string().regex(PENDING_UPLOAD_ID_REGEX, "Invalid upload id."),
});

const titleSchema = z
  .string()
  .trim()
  .min(1, "Title is required.")
  .max(100, "Title must be at most 100 characters.");

const descriptionSchema = z
  .string()
  .max(5000, "Description must be at most 5000 characters.")
  .optional();

const tagSchema = z
  .string()
  .trim()
  .min(1, "Tags cannot be empty.")
  .max(30, "Each tag must be at most 30 characters.");

const tagsSchema = z
  .array(tagSchema)
  .max(15, "YouTube allows up to 15 tags per video.")
  .default([]);

const categoryIdSchema = z
  .string()
  .regex(/^\d{1,2}$/, "Category must be a 1-2 digit YouTube category id.")
  .default("22");

const privacyStatusSchema = z
  .enum(["private", "unlisted", "public"])
  .default("private");

const scheduledPublishAtSchema = z
  .string()
  .datetime({ message: "scheduledPublishAt must be ISO8601." })
  .optional();

const contentTypeSchema = z
  .string()
  .regex(/^video\//, "contentType must start with 'video/'.")
  .default("video/mp4");

// ---- YouTube content controls (status block) ----
//
// These mirror the fields the YouTube Data API v3 accepts under
// `status.*` on `videos.insert`. Defaults match the row defaults so a
// client that doesn't care about them still produces a valid upload.

const madeForKidsSchema = z.boolean().default(false);

const ageRestrictionSchema = z
  .enum(["none", "18+"])
  .default("none");

const embeddableSchema = z.boolean().default(true);

const licenseSchema = z
  .enum(["standard", "creativeCommon"])
  .default("standard");

const publicStatsViewableSchema = z.boolean().default(true);

const commentPolicySchema = z
  .enum(["allowAll", "holdAll", "disable"])
  .default("allowAll");

/**
 * Body for `POST /api/videos`. The metadata submitted at create time;
 * the file is uploaded separately via the presigned POST URL.
 */
export const createVideoSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  tags: tagsSchema,
  categoryId: categoryIdSchema,
  privacyStatus: privacyStatusSchema,
  scheduledPublishAt: scheduledPublishAtSchema,
  madeForKids: madeForKidsSchema,
  ageRestriction: ageRestrictionSchema,
  embeddable: embeddableSchema,
  license: licenseSchema,
  publicStatsViewable: publicStatsViewableSchema,
  commentPolicy: commentPolicySchema,
  originalFilename: z
    .string()
    .trim()
    .min(1, "originalFilename is required.")
    .max(255, "originalFilename is too long."),
  contentType: contentTypeSchema,
  fileSizeBytes: z
    .number()
    .int("fileSizeBytes must be an integer.")
    .positive("fileSizeBytes must be positive."),
});

export type CreateVideoInput = z.infer<typeof createVideoSchema>;

/**
 * Query for `GET /api/videos?status=...`. Powering the SSR dashboard
 * (excludes PUBLISHED) and the published page (`status=PUBLISHED`).
 * Anything else is rejected at the edge so the service can rely on
 * the enum shape.
 */
export const listVideosQuerySchema = z.object({
  status: z
    .enum([
      "UPLOADED",
      "READY",
      "SCHEDULED",
      "PUBLISHING",
      "PUBLISHED",
      "PUBLISH_FAILED",
    ])
    .optional(),
});

export type ListVideosQuery = z.infer<typeof listVideosQuerySchema>;
