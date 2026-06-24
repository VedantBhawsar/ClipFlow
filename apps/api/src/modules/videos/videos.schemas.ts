/**
 * Zod schemas for the videos module.
 *
 * Mirrors the bounds YouTube enforces on its own videos.insert payload
 * so we reject bad metadata server-side before enqueueing.
 */
import { z } from "zod";

/**
 * Video ids are minted server-side as `vid_<uuid>` (see
 * `videos.service.ts → createVideo`). We validate the full prefixed shape
 * here so a malformed id fails fast at the edge with 400 instead of
 * reaching Prisma's `findUnique` and surfacing as a confusing 404.
 */
const VIDEO_ID_REGEX =
  /^vid_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const videoIdParamsSchema = z.object({
  id: z.string().regex(VIDEO_ID_REGEX, "Invalid video id."),
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