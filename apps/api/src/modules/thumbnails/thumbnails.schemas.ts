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
