import { z } from "zod";
import { THUMBNAIL_STYLES } from "@clipflow/types";

const VIDEO_ID_REGEX =
  /^vid_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const videoIdParamsSchema = z.object({
  id: z.string().regex(VIDEO_ID_REGEX, "Invalid video id."),
});

export const thumbnailIdParamsSchema = z.object({
  id: z.string().regex(VIDEO_ID_REGEX, "Invalid video id."),
  thumbnailId: z.string().min(1, "Thumbnail ID is required."),
});

export const regenerateThumbnailsBodySchema = z
  .object({
    chapterTimestamps: z.array(z.number().int().positive()).optional(),
    customPrompt: z.string().max(2000).optional(),
  })
  .optional()
  .default({});

export const updateThumbnailStyleBodySchema = z.object({
  styleOverride: z.enum(THUMBNAIL_STYLES),
});

/**
 * Body for POST /api/thumbnail-style/analyze.
 *
 * Empty/missing body falls back to the auto-pick flow (the worker's
 * `search.list` chooses the 10 most-recent thumbnails). When the user
 * picked references themselves (onboarding step 5 or the settings
 * "Refresh my channel style" CTA), `selectedThumbnailUrls` must contain
 * 1–4 PNG/JPEG/WebP URLs.
 *
 * The regex requires a `.png` / `.jpg` / `.jpeg` / `.webp` extension
 * (case-insensitive) at the end of the URL — possibly followed by a
 * query string for signed URLs (e.g. `?GoogleAccessId=...`). We validate
 * at the edge so the worker doesn't have to re-validate and we surface
 * a clear 400 instead of a downstream Gemini Vision failure on a
 * non-image URL.
 *
 * Both fields are optional inside the object so an empty body parses
 * cleanly to `{}`. The controller branches on whether
 * `selectedThumbnailUrls` is present and non-empty.
 */
export const triggerStyleAnalysisBodySchema = z
  .object({
    selectedThumbnailUrls: z
      .array(z.string().url())
      .min(1, "Pick at least one thumbnail.")
      .max(4, "Pick at most four thumbnails.")
      .refine(
        (urls) => urls.every((u) => /\.(png|jpe?g|webp)(\?|$)/i.test(u)),
        "Each URL must point to a PNG / JPEG / WebP image.",
      )
      .optional(),
  })
  .default({});

export type TriggerStyleAnalysisBody = z.infer<
  typeof triggerStyleAnalysisBodySchema
>;
