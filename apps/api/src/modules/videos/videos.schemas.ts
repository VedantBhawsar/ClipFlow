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

// ---- Thumbnail (optional) ----
//
// YouTube accepts only JPEG / PNG on `thumbnails.set` and rejects
// anything >2 MB. We enforce both at the edge so a malformed client
// payload fails fast (400) instead of reaching S3 + YouTube. The
// matching runtime guards live in the service.
const THUMBNAIL_CONTENT_TYPES = ["image/jpeg", "image/png"] as const;
const thumbnailContentTypeSchema = z
  .string()
  .refine(
    (v) => (THUMBNAIL_CONTENT_TYPES as readonly string[]).includes(v),
    "thumbnailContentType must be image/jpeg or image/png.",
  )
  .optional();
const thumbnailFileSizeBytesSchema = z
  .number()
  .int("thumbnailFileSizeBytes must be an integer.")
  .positive("thumbnailFileSizeBytes must be positive.")
  .max(
    2 * 1024 * 1024,
    "thumbnailFileSizeBytes must be at most 2 MB (YouTube's limit).",
  )
  .optional();
const thumbnailOriginalFilenameSchema = z
  .string()
  .trim()
  .min(1, "thumbnailOriginalFilename is required when thumbnail bytes are provided.")
  .max(255, "thumbnailOriginalFilename is too long.")
  .optional();

/**
 * If the thumbnail byte size is provided, contentType + filename must
 * be too — partial payloads are almost always a client bug, so reject
 * them at the edge instead of silently dropping the thumbnail.
 */
const thumbnailRefinement = (
  data: {
    thumbnailContentType?: string;
    thumbnailFileSizeBytes?: number;
    thumbnailOriginalFilename?: string;
  },
): boolean | { path: string[]; message: string }[] => {
  const present: Array<keyof typeof data> = [];
  if (data.thumbnailContentType !== undefined) present.push("thumbnailContentType");
  if (data.thumbnailFileSizeBytes !== undefined) present.push("thumbnailFileSizeBytes");
  if (data.thumbnailOriginalFilename !== undefined)
    present.push("thumbnailOriginalFilename");
  if (present.length === 0) return true;
  if (present.length === 3) return true;
  const allKeys: Array<keyof typeof data> = [
    "thumbnailContentType",
    "thumbnailFileSizeBytes",
    "thumbnailOriginalFilename",
  ];
  const missing = allKeys.filter((k) => !present.includes(k));
  return [
    {
      path: ["thumbnail"],
      message: `Provide ${missing.join(", ")} together, or omit all three.`,
    },
  ];
};

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
  thumbnailContentType: thumbnailContentTypeSchema,
  thumbnailFileSizeBytes: thumbnailFileSizeBytesSchema,
  thumbnailOriginalFilename: thumbnailOriginalFilenameSchema,
}).superRefine(thumbnailRefinement);

export type CreateVideoInput = z.infer<typeof createVideoSchema>;

/**
 * Query for `GET /api/videos?status=...&q=...&page=...&pageSize=...`.
 *
 * - `status` accepts the real lifecycle states OR the virtual
 *   `NOT_PUBLISHED` sentinel — that value maps to a `status: { not:
 *   "PUBLISHED" }` Prisma filter in the service so the dashboard can
 *   ask for "everything except PUBLISHED" without dragging that
 *   decision onto the client.
 * - `q` is a case-insensitive substring search against title,
 *   description, and tags (the three columns a user can plausibly
 *   remember a video by). Empty string is equivalent to omitting it.
 * - `page` is 1-indexed; `pageSize` is capped at 100 so a runaway
 *   client can't ask for the whole table.
 *
 * All fields are optional. Anything else is rejected at the edge so
 * the service can rely on the parsed shape.
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
      "NOT_PUBLISHED",
    ])
    .optional(),
  q: z
    .string()
    .trim()
    .max(100, "Search query must be at most 100 characters.")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  page: z
    .string()
    .optional()
    .transform((v) => (v ? Number.parseInt(v, 10) : 1))
    .pipe(
      z
        .number()
        .int("page must be an integer.")
        .min(1, "page must be at least 1.")
        .max(1000, "page must be at most 1000."),
    ),
  pageSize: z
    .string()
    .optional()
    .transform((v) => (v ? Number.parseInt(v, 10) : 12))
    .pipe(
      z
        .number()
        .int("pageSize must be an integer.")
        .min(1, "pageSize must be at least 1.")
        .max(100, "pageSize must be at most 100."),
    ),
});

export type ListVideosQuery = z.infer<typeof listVideosQuerySchema>;

/**
 * Query for `GET /api/videos/published?q=...&page=...&pageSize=...&privacy=...&since=...`.
 * The status is implicitly PUBLISHED; the schema mirrors
 * `listVideosQuerySchema` minus the status field so the
 * `publishedAt desc` ordering in the service stays a hard guarantee
 * (the endpoint can never be asked for non-published rows).
 *
 * - `privacy` narrows the list to public / unlisted / private rows.
 *   Omit (or send "all") for no privacy filter — `privacy` is a
 *   fan-out filter, not a default.
 * - `since` is an ISO8601 date; the service translates it into a
 *   `publishedAt: { gte: since }` Prisma filter. Useful for "last 30
 *   days / last year" chips on the published page.
 */
export const listPublishedVideosQuerySchema = z.object({
  q: listVideosQuerySchema.shape.q,
  privacy: z
    .enum(["all", "public", "unlisted", "private"])
    .optional()
    .transform((v) => (v === "all" ? undefined : v)),
  since: z
    .string()
    .datetime({ message: "since must be ISO8601." })
    .optional(),
  page: listVideosQuerySchema.shape.page,
  pageSize: listVideosQuerySchema.shape.pageSize,
});

export type ListPublishedVideosQuery = z.infer<
  typeof listPublishedVideosQuerySchema
>;

// ---- Video metadata update (PATCH /api/videos/:id) ----
//
// Used by the in-place editor on the review screen. All fields are
// optional — the service merges on top of the existing row, so the
// client can patch one field at a time.
//
// Bounds mirror `createVideoSchema`'s rules (YouTube enforces these
// limits server-side on videos.insert, so we reject locally before the
// publish path) plus the chapter invariants the LLM uses on initial
// generation. Anything that survives this schema can publish cleanly.

/**
 * A single chapter — the same shape the LLM produces. Kept as a named
 * schema so both `chaptersSummarySchema` and the LLM-side validation
 * can reference one definition.
 */
const updateChapterSchema = z.object({
  startMs: z
    .number()
    .int("Chapter startMs must be an integer.")
    .min(0, "Chapter startMs must be non-negative."),
  title: z
    .string()
    .trim()
    .min(1, "Chapter title is required.")
    .max(100, "Chapter title must be at most 100 characters."),
});

/**
 * The `chapters + summary` payload the editor sends. Mirrors the
 * invariants `LlmOutputSchema` enforces on the worker side so a
 * user-edited chapter list will still publish cleanly to YouTube.
 */
const chaptersSummarySchema = z
  .object({
    summary: z
      .string()
      .trim()
      .max(280, "Summary must be at most 280 characters."),
    chapters: z
      .array(updateChapterSchema)
      .min(3, "YouTube requires at least 3 chapters.")
      .max(12, "YouTube allows at most 12 chapters."),
  })
  .refine(
    (o) => o.chapters[0]?.startMs === 0,
    "First chapter must start at 0 ms.",
  )
  .refine(
    (o) => {
      for (let i = 1; i < o.chapters.length; i++) {
        const prev = o.chapters[i - 1]!.startMs;
        const curr = o.chapters[i]!.startMs;
        if (curr - prev < 10_000) return false;
      }
      return true;
    },
    "Consecutive chapters must be at least 10 seconds apart.",
  );

/**
 * Body for `PATCH /api/videos/:id`. Partial — every field optional.
 * The service builds the prisma update payload from the keys that
 * actually appeared in the request body, so omitting a field is a
 * no-op (the existing value is preserved).
 *
 * Note: `title` is required to be present on create but optional here
 * — a creator who already wrote a title at create time shouldn't be
 * forced to re-send it when they only want to tweak a chapter.
 */
export const updateVideoSchema = z
  .object({
    title: titleSchema.optional(),
    description: z
      .string()
      .max(5000, "Description must be at most 5000 characters.")
      .nullable()
      .optional(),
    tags: tagsSchema.optional(),
    summary: z
      .string()
      .trim()
      .max(280, "Summary must be at most 280 characters.")
      .optional(),
    chapters: z
      .array(updateChapterSchema)
      .min(3, "YouTube requires at least 3 chapters.")
      .max(12, "YouTube allows at most 12 chapters.")
      .optional(),
    // YouTube status block — reuse the schemas already declared above
    // for `createVideoSchema` so the bounds stay in one place. All
    // optional so a per-section save can patch one field at a time.
    privacyStatus: privacyStatusSchema.optional(),
    madeForKids: madeForKidsSchema.optional(),
    embeddable: embeddableSchema.optional(),
    license: licenseSchema.optional(),
    publicStatsViewable: publicStatsViewableSchema.optional(),
    commentPolicy: commentPolicySchema.optional(),
  })
  .refine(
    (data) => {
      // If both summary and chapters are present, also check the
      // combined invariants (first=0, 10s gap). When only one is
      // provided, the corresponding single-field schema above already
      // validated it.
      if (data.summary === undefined || data.chapters === undefined) return true;
      const combined = chaptersSummarySchema.safeParse({
        summary: data.summary,
        chapters: data.chapters,
      });
      return combined.success;
    },
    {
      message:
        "Chapters must start at 0 ms and be at least 10 seconds apart.",
    },
  );

export type UpdateVideoInput = z.infer<typeof updateVideoSchema>;

// ---- Publish / Schedule (POST /api/videos/:id/publish) ----
//
// Body for the user-driven "Publish" button on the video detail page.
// The service ALWAYS enqueues — empty body flips the row to
// `PUBLISHING` and enqueues an immediate BullMQ job (the worker owns
// the actual YouTube upload). A `scheduledPublishAt` flips the row to
// `SCHEDULED` and enqueues a delayed `youtube-publish` job. Either way
// the controller returns 202 Accepted.
//
// YouTube's own window for scheduled videos is 15 min ≤ publishAt ≤
// 60 days out. We mirror those bounds here so the server is the source
// of truth — a hand-rolled client can't bypass the 15-min floor by
// omitting the field and POSTing a date directly into the job payload.

/**
 * Minimum lead time YouTube accepts on a scheduled video. Anything
 * closer than this returns 400 from `videos.insert`.
 */
const SCHEDULED_MIN_LEAD_MS = 15 * 60 * 1000;
/**
 * Maximum lead time YouTube accepts on a scheduled video.
 */
const SCHEDULED_MAX_LEAD_MS = 60 * 24 * 60 * 60 * 1000;

export const publishVideoSchema = z
  .object({
    scheduledPublishAt: scheduledPublishAtSchema,
  })
  .superRefine((data, ctx) => {
    if (data.scheduledPublishAt === undefined) return;
    const ms = new Date(data.scheduledPublishAt).getTime();
    const now = Date.now();
    if (ms <= now) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduledPublishAt"],
        message: "scheduledPublishAt must be in the future.",
      });
      return;
    }
    if (ms - now < SCHEDULED_MIN_LEAD_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduledPublishAt"],
        message:
          "scheduledPublishAt must be at least 15 minutes in the future (YouTube minimum).",
      });
      return;
    }
    if (ms - now > SCHEDULED_MAX_LEAD_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduledPublishAt"],
        message:
          "scheduledPublishAt must be within 60 days (YouTube scheduled maximum).",
      });
    }
  });

export type PublishVideoInput = z.infer<typeof publishVideoSchema>;
