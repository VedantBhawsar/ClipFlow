/**
 * Worker job: generate thumbnails for a video using chapter context,
 * extracted frames, and the channel's detected visual style.
 *
 * Flow:
 *   1. Resolve the Video row with chaptersJson, frames, user info.
 *   2. Idempotency: skip if ThumbnailGeneration rows already exist
 *      with COMPLETED status for this video.
 *   3. Resolve the user's channel style and content niche.
 *   4. For each chapter, match the closest extracted frame.
 *   5. Build per-chapter prompts with chapter context + style + niche.
 *   6. Call ImageGenClient to generate thumbnails.
 *   7. Upload generated images to S3.
 *   8. Create Thumbnail + ThumbnailGeneration rows.
 *   9. Flip status to READY_FOR_REVIEW.
 *
 * Failure handling:
 *   - Permanent (image gen auth, bad model, content filtered) →
 *     set FAILED on the ThumbnailGeneration row, return without retry.
 *   - Transient (rate limit, upstream error) → rethrow for BullMQ.
 *
 * The video does NOT reach READY_FOR_REVIEW until thumbnails complete,
 * since thumbnails wait for chapters per the agreed pipeline order.
 */
import type { Job } from "bullmq";
import type { Env } from "@clipflow/config";
import { prisma } from "@clipflow/db";
import {
  buildS3Config,
  getS3Client,
  createPresignedGetUrl,
  putObjectFromFile,
} from "@clipflow/s3";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ImageGenClient,
  buildThumbnailPrompt,
  classifyImageGenError,
} from "../lib/image-gen/index.js";
import type { Logger } from "../config/logger.js";
import type { EventPublisher } from "../lib/events.js";

export interface ThumbnailsJobData {
  videoId: string;
}

export interface ProcessContext {
  env: Env;
  logger: Logger;
  events?: EventPublisher;
}

const TMP_PREFIX = join(tmpdir(), "clipflow-thumbnails-");

const nowIso = (): string => new Date().toISOString();

/**
 * Match a chapter's startMs to the closest extracted frame.
 * Frames are numbered frame_NNN.jpg at fps=1/10, so frame_001 = 10s.
 */
const matchFrame = (
  startMs: number,
  s3KeyFramesPrefix: string,
  frameCount: number,
): string | null => {
  const frameIndex = Math.round(startMs / 1000 / 10);
  if (frameIndex < 0 || frameIndex >= frameCount) return null;
  const frameNum = String(frameIndex + 1).padStart(3, "0");
  return `${s3KeyFramesPrefix}frame_${frameNum}.jpg`;
};

/**
 * Decode a base64 data URI and save it to a temp file.
 */
const saveBase64Image = async (
  dataUri: string,
  outputDir: string,
  index: number,
): Promise<string> => {
  const match = dataUri.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) throw new Error(`Unsupported data URI format: ${dataUri.slice(0, 50)}...`);

  const ext = match[1] === "image/png" ? "png" : "jpg";
  const base64Data = match[2];
  if (!base64Data) throw new Error("Missing base64 data in URI");
  const path = join(outputDir, `thumb_${String(index).padStart(2, "0")}.${ext}`);
  await writeFile(path, Buffer.from(base64Data, "base64"));
  return path;
};

/**
 * Build a short style description from the ChannelThumbnailStyle for use in prompts.
 *
 * Short-circuits to `null` when `confidence === "LOW"` — the personalized
 * analysis returned all-default fields (no parseable style JSON), so we
 * drop the style attribution rather than describe a "center / text-heavy /
 * sometimes-face" creator that doesn't actually exist. Downstream callers
 * fall back to the niche-only prompt and Gemini Vision has to do more
 * heavy lifting, but we never invent a style the creator didn't have.
 */
const buildStyleDescription = (style: {
  dominantColors: unknown;
  textPlacement: string | null;
  compositionStyle: string | null;
  facePresence: string | null;
  brandElements: unknown;
  analysisRaw: string | null;
  confidence?: string | null;
}): string | null => {
  if (style.confidence === "LOW") {
    return null;
  }

  const parts: string[] = [];
  if (style.compositionStyle) parts.push(`Composition: ${style.compositionStyle}`);
  if (style.facePresence) parts.push(`Face usage: ${style.facePresence}`);
  if (style.textPlacement) parts.push(`Text placement: ${style.textPlacement}`);
  if (style.analysisRaw) {
    const parsed = style.analysisRaw.length > 500
      ? style.analysisRaw.slice(0, 500) + "..."
      : style.analysisRaw;
    parts.push(`Full analysis: ${parsed}`);
  }
  return parts.length > 0 ? parts.join("; ") : null;
};

/**
 * Mark the ThumbnailGeneration and return without further retries.
 */
const markGenerationFailed = async (
  ctx: ProcessContext,
  videoId: string,
  generationId: string,
  reason: string,
): Promise<void> => {
  await prisma.thumbnailGeneration.update({
    where: { id: generationId },
    data: {
      status: "FAILED",
      errorCode: reason.split("]")[0]?.slice(1) ?? "UNKNOWN",
      errorMessage: reason,
      completedAt: new Date(),
    },
  });

  if (ctx.events) {
    void ctx.events.publish({
      type: "ERROR",
      videoId,
      userId: "",
      error: reason,
      timestamp: nowIso(),
    });
  }
};

/**
 * Process one `thumbnails` BullMQ job.
 */
export const processThumbnailsJob = async (
  job: Job<ThumbnailsJobData>,
  ctx: ProcessContext,
): Promise<void> => {
  const { videoId } = job.data;
  ctx.logger.info(
    { jobId: job.id, videoId, attempt: job.attemptsMade + 1 },
    "Starting thumbnails job",
  );

  // ---- Resolve the Video row ----
  const video = await prisma.video
    .findUnique({
      where: { id: videoId },
      select: {
        id: true,
        userId: true,
        title: true,
        description: true,
        durationSeconds: true,
        chaptersJson: true,
        s3KeyFramesPrefix: true,
        frameCount: true,
        status: true,
        user: {
          select: {
            profile: {
              select: { niche: true },
            },
            thumbnailStyle: {
              select: {
                id: true,
                dominantColors: true,
                textPlacement: true,
                compositionStyle: true,
                facePresence: true,
                brandElements: true,
                analysisRaw: true,
                confidence: true,
              },
            },
          },
        },
      },
    })
    .catch(() => null);

  if (!video) {
    ctx.logger.warn({ videoId }, "Video row missing — skipping thumbnails");
    return;
  }

  const userId = video.userId;
  const canPublish = !!userId && !!ctx.events;

  // ---- Idempotency: skip if already generated thumbnails ----
  const existingGenerations = await prisma.thumbnailGeneration.count({
    where: { videoId, status: "COMPLETED" },
  });
  if (existingGenerations > 0) {
    ctx.logger.info(
      { videoId, generationCount: existingGenerations },
      "Thumbnails already exist — skipping (idempotent)",
    );
    return;
  }

  // ---- Prerequisites check ----
  if (!video.chaptersJson || !video.s3KeyFramesPrefix || !video.frameCount) {
    const reason =
      "[THUMBNAIL_PREREQ_MISSING] Chapters, frames, or duration missing — cannot generate thumbnails.";
    ctx.logger.warn({ videoId, status: video.status }, reason);
    // Don't fail the video — just log and let the next re-enqueue handle it
    return;
  }

  const chaptersJson = video.chaptersJson as {
    summary?: string;
    chapters?: Array<{ startMs: number; title: string }>;
  };
  const chapters = chaptersJson.chapters;
  if (!chapters || chapters.length === 0) {
    const reason =
      "[NO_CHAPTERS] Chapters list is empty — cannot generate chapter-aware thumbnails.";
    ctx.logger.warn({ videoId }, reason);
    await markGenerationFailed(ctx, videoId, "", reason);
    return;
  }

  const niche = video.user.profile?.niche ?? "OTHER";
  const styleDesc = video.user.thumbnailStyle
    ? buildStyleDescription(video.user.thumbnailStyle)
    : null;

  // ---- Determine how many thumbnails to generate ----
  const maxThumbnails = ctx.env.THUMBNAILS_PER_VIDEO;
  const chaptersToUse = chapters.slice(0, maxThumbnails);

  ctx.logger.info(
    {
      videoId,
      chapterCount: chapters.length,
      chaptersToUse: chaptersToUse.length,
      maxThumbnails,
      niche,
      hasStyle: !!styleDesc,
      frameCount: video.frameCount,
    },
    "Preparing thumbnail generation",
  );

  // ---- Create the ThumbnailGeneration row ----
  const generation = await prisma.thumbnailGeneration.create({
    data: {
      videoId,
      status: "PROCESSING",
      promptText: "",
      modelUsed: ctx.env.IMAGE_GEN_PROVIDER === "gemini"
        ? ctx.env.GEMINI_IMAGE_MODEL
        : ctx.env.IMAGE_GEN_PROVIDER === "replicate"
          ? ctx.env.REPLICATE_IMAGE_MODEL
          : ctx.env.NVIDIA_IMAGE_MODEL,
      chapterRefs: chaptersToUse.map((c) => ({
        startMs: c.startMs,
        title: c.title,
      })) as unknown as object,
      frameRefs: chaptersToUse.map((c) =>
        matchFrame(c.startMs, video.s3KeyFramesPrefix!, video.frameCount!),
      ).filter(Boolean) as unknown as object,
      channelStyleId: video.user.thumbnailStyle?.id ?? null,
    },
  });

  // ---- Temp dir setup ----
  const tempDir = await mkdtemp(TMP_PREFIX);

  try {
    const imageGenClient = new ImageGenClient(ctx.env);
    const generatedThumbnailIds: string[] = [];
    const s3Config = buildS3Config(ctx.env);
    const s3Client = getS3Client(s3Config);

    if (canPublish) {
      void ctx.events!.publish({
        type: "PROGRESS",
        videoId,
        userId: userId!,
        progress: 10,
        stage: `Generating ${chaptersToUse.length} thumbnails`,
        timestamp: nowIso(),
      });
    }

    const visionEnabled = ctx.env.THUMBNAIL_VISION_ENABLED;

    for (let i = 0; i < chaptersToUse.length; i++) {
      const chapter = chaptersToUse[i]!;
      const frameKey = visionEnabled
        ? matchFrame(
            chapter.startMs,
            video.s3KeyFramesPrefix!,
            video.frameCount!,
          )
        : null;

      ctx.logger.info(
        {
          videoId,
          index: i,
          chapter: chapter.title,
          startMs: chapter.startMs,
          frameKey,
          visionEnabled,
        },
        `Generating thumbnail ${i + 1}/${chaptersToUse.length}`,
      );

      if (canPublish) {
        void ctx.events!.publish({
          type: "PROGRESS",
          videoId,
          userId: userId!,
          progress: 10 + Math.round((70 * i) / chaptersToUse.length),
          stage: `Thumbnail ${i + 1}: "${chapter.title.slice(0, 30)}"`,
          timestamp: nowIso(),
        });
      }

      const { systemPrompt, userPrompt } = buildThumbnailPrompt({
        videoTitle: video.title,
        videoDescription: video.description,
        chapterTitle: chapter.title,
        chapterStartMs: chapter.startMs,
        channelStyle: styleDesc,
        niche,
        durationSeconds: video.durationSeconds ?? 0,
      });

      const referenceUrl =
        frameKey && visionEnabled
          ? await createPresignedGetUrl(s3Client, s3Config, frameKey, 900)
          : undefined;

      let genResult: Awaited<ReturnType<typeof imageGenClient.generateImage>>;
      try {
        genResult = await imageGenClient.generateImage({
          prompt: `${systemPrompt}\n\n${userPrompt}`,
          count: 1,
          aspectRatio: "16:9",
          referenceImages: referenceUrl ? [referenceUrl] : undefined,
        });
      } catch (err) {
        // If Gemini fails and Replicate is configured, try fallback
        const classified = classifyImageGenError(err);
        if (classified.kind === "permanent") {
          await markGenerationFailed(
            ctx,
            videoId,
            generation.id,
            `[${classified.reasonCode}] ${classified.message}`,
          );
          ctx.logger.warn(
            { videoId, reasonCode: classified.reasonCode },
            "Thumbnail generation failed permanently",
          );
          return;
        }
        throw err;
      }

      ctx.logger.info(
        { videoId, index: i, provider: genResult.provider, model: genResult.modelUsed },
        `Generated thumbnail ${i + 1}`,
      );

      // ---- Save each generated image to S3 ----
      for (let j = 0; j < genResult.images.length; j++) {
        const imageData = genResult.images[j]!;
        const thumbPath = await saveBase64Image(imageData, tempDir, i * 10 + j);
        const s3Key = `videos/${videoId}/thumbnails/gen_${generation.id}_${String(i).padStart(2, "0")}_${j}.jpg`;

        await putObjectFromFile(s3Client, s3Config, s3Key, thumbPath, "image/jpeg");

        const thumb = await prisma.thumbnail.create({
          data: {
            videoId,
            s3Key,
            source: "AI_GENERATED",
            generationIndex: i,
          },
        });

        generatedThumbnailIds.push(thumb.id);
      }
    }

    // ---- Update generation row with results ----
    const thumbnailCount = generatedThumbnailIds.length;
    await prisma.thumbnailGeneration.update({
      where: { id: generation.id },
      data: {
        status: thumbnailCount > 0 ? "COMPLETED" : "FAILED",
        generatedIds: generatedThumbnailIds,
        completedAt: new Date(),
        errorCode: thumbnailCount === 0 ? "NO_IMAGES_GENERATED" : null,
        errorMessage: thumbnailCount === 0 ? "No thumbnails were successfully generated" : null,
      },
    });

    // ---- Flip video to READY_FOR_REVIEW ----
    if (thumbnailCount > 0) {
      await prisma.video.update({
        where: { id: videoId },
        data: {
          status: "READY_FOR_REVIEW",
          failureReason: null,
        },
      });

      if (canPublish) {
        void ctx.events!.publish({
          type: "STATUS_UPDATE",
          videoId,
          userId: userId!,
          status: "READY_FOR_REVIEW",
          timestamp: nowIso(),
        });
      }

      ctx.logger.info(
        { videoId, thumbnailCount, generationId: generation.id },
        "Thumbnails job completed — video is READY_FOR_REVIEW",
      );
    } else {
      ctx.logger.warn({ videoId, generationId: generation.id }, "No thumbnails generated");
    }
  } catch (err) {
    // Ensure generation is marked as failed
    try {
      await prisma.thumbnailGeneration.update({
        where: { id: generation.id },
        data: {
          status: "FAILED",
          errorCode: "THUMBNAIL_ERROR",
          errorMessage: err instanceof Error ? err.message : String(err),
          completedAt: new Date(),
        },
      });
    } catch {
      // Best-effort
    }

    ctx.logger.error(
      {
        videoId,
        err: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      "Thumbnails job failed unexpectedly; will retry",
    );
    throw err;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
};
