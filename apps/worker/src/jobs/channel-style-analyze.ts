/**
 * Worker job: analyze a creator's existing YouTube thumbnails to detect
 * their visual style via Gemini Vision.
 *
 * Flow:
 *   1. Resolve the User row with YouTubeChannel relation.
 *   2. Idempotency guard: skip if ChannelThumbnailStyle already exists
 *      AND lastAnalyzedAt is less than 24 hours old.
 *   3. Fetch recent video thumbnails — try YouTube Data API v3
 *      (search.list with channelId & order=date via a Google OAuth2
 *      client-credentials token), then fall back to the channel's
 *      channelThumbnailUrl.
 *   4. Send the thumbnail URLs to Gemini Vision via
 *      ImageGenClient.analyzeImages() with the
 *      buildStyleAnalysisPrompt() prompt.
 *   5. Parse the result via parseStyleAnalysis().
 *   6. Upsert the ChannelThumbnailStyle row with parsed data.
 *   7. Publish SSE PROGRESS & STATUS_UPDATE events.
 *   8. Permanent failure (Gemini auth, bad response, no thumbnails) →
 *      set failureReason on the style row and return without retry.
 *   9. Transient failure (network, rate limit) → rethrow for BullMQ
 *      exponential backoff.
 */
import type { Job } from "bullmq";
import type { Env } from "@clipflow/config";
import { prisma } from "@clipflow/db";
import {
  ImageGenClient,
  buildStyleAnalysisPrompt,
  parseStyleAnalysis,
} from "../lib/image-gen/index.js";
import { classifyImageGenError } from "../lib/image-gen/image-gen-errors.js";
import type { Logger } from "../config/logger.js";
import type { EventPublisher } from "../lib/events.js";

export interface ChannelStyleJobData {
  userId: string;
}

export interface ProcessContext {
  env: Env;
  logger: Logger;
  events?: EventPublisher;
}

const STALE_AFTER_MS = 24 * 60 * 60 * 1_000;
const YOUTUBE_SEARCH_MAX = 10;

const nowIso = (): string => new Date().toISOString();

/**
 * Mark the style row as failed and publish SSE ERROR.
 */
const markFailed = async (
  ctx: ProcessContext,
  userId: string,
  reason: string,
): Promise<void> => {
  try {
    await prisma.channelThumbnailStyle.upsert({
      where: { userId },
      create: { userId, analysisRaw: reason, thumbnailCount: 0 },
      update: { analysisRaw: reason, thumbnailCount: 0 },
    });
  } catch {
    // Best-effort — row may not exist yet and upsert handles it
  }

  if (ctx.events) {
    void ctx.events.publish({
      type: "ERROR",
      videoId: `channel-style-${userId}`,
      userId,
      error: reason,
      timestamp: nowIso(),
    });
  }
};

/**
 * Fetch recent video thumbnails for a YouTube channel.
 *
 * Tries the YouTube Data API v3 search.list endpoint with an OAuth2
 * client-credentials access token first. Falls back to the channel's
 * channelThumbnailUrl if the API call is unavailable or returns too few
 * results.
 */
const fetchRecentThumbnails = async (
  env: Env,
  channelId: string,
  channelThumbnailUrl: string | null,
): Promise<string[]> => {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = env;

  if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          grant_type: "client_credentials",
        }).toString(),
      });

      if (tokenRes.ok) {
        const { access_token } = (await tokenRes.json()) as { access_token: string };

        const searchRes = await fetch(
          `https://www.googleapis.com/youtube/v3/search` +
            `?part=snippet&channelId=${encodeURIComponent(channelId)}` +
            `&order=date&maxResults=${YOUTUBE_SEARCH_MAX}&type=video`,
          { headers: { Authorization: `Bearer ${access_token}` } },
        );

        if (searchRes.ok) {
          const data = (await searchRes.json()) as {
            items?: Array<{
              snippet?: {
                thumbnails?: Record<string, { url: string }>;
              };
            }>;
          };

          const urls: string[] = [];
          for (const item of data.items ?? []) {
            const thumbs = item.snippet?.thumbnails;
            const url = thumbs?.high?.url ?? thumbs?.medium?.url ?? thumbs?.default?.url;
            if (url) urls.push(url);
          }

          if (urls.length >= 3) return urls;
        }
      }
    } catch {
      // Fall through to the channelThumbnailUrl fallback
    }
  }

  if (channelThumbnailUrl) return [channelThumbnailUrl];

  return [];
};

/**
 * Process one `channel-style-analyze` BullMQ job.
 */
export const processChannelStyleAnalyzeJob = async (
  job: Job<ChannelStyleJobData>,
  ctx: ProcessContext,
): Promise<void> => {
  const { userId } = job.data;
  ctx.logger.info(
    { jobId: job.id, userId, attempt: job.attemptsMade + 1 },
    "Starting channel-style-analyze job",
  );

  // ---- Resolve the User row with YouTubeChannel ----
  const user = await prisma.user
    .findUnique({
      where: { id: userId },
      select: {
        id: true,
        youtubeChannel: {
          select: {
            youtubeChannelId: true,
            channelTitle: true,
            channelThumbnailUrl: true,
          },
        },
        thumbnailStyle: {
          select: {
            id: true,
            lastAnalyzedAt: true,
          },
        },
      },
    })
    .catch(() => null);

  if (!user) {
    ctx.logger.warn({ userId }, "User row missing — skipping style analysis");
    return;
  }

  // ---- Idempotency: skip if already analyzed within 24h ----
  if (user.thumbnailStyle?.lastAnalyzedAt) {
    const age = Date.now() - user.thumbnailStyle.lastAnalyzedAt.getTime();
    if (age < STALE_AFTER_MS) {
      ctx.logger.info(
        { userId, lastAnalyzedAt: user.thumbnailStyle.lastAnalyzedAt.toISOString(), ageMs: age },
        "Channel style analyzed recently (<24h) — skipping (idempotent)",
      );
      return;
    }
  }

  const channel = user.youtubeChannel;
  if (!channel) {
    const reason =
      "[NO_YOUTUBE_CHANNEL] User has no connected YouTube channel — cannot analyze thumbnails.";
    await markFailed(ctx, userId, reason);
    ctx.logger.warn({ userId }, reason);
    return;
  }

  const canPublish = !!ctx.events;

  // ---- Publish initial progress ----
  if (canPublish) {
    void ctx.events!.publish({
      type: "PROGRESS",
      videoId: `channel-style-${userId}`,
      userId,
      progress: 5,
      stage: "Fetching recent thumbnails",
      timestamp: nowIso(),
    });
  }

  // ---- Fetch recent thumbnails ----
  const thumbnailUrls = await fetchRecentThumbnails(
    ctx.env,
    channel.youtubeChannelId,
    channel.channelThumbnailUrl,
  );

  if (thumbnailUrls.length === 0) {
    const reason =
      "[NO_THUMBNAILS] No recent thumbnails could be fetched from YouTube — cannot analyze style.";
    await markFailed(ctx, userId, reason);
    ctx.logger.warn(
      { userId, channelId: channel.youtubeChannelId },
      reason,
    );
    return;
  }

  ctx.logger.info(
    { userId, thumbnailCount: thumbnailUrls.length },
    "Fetched thumbnails for analysis",
  );

  // ---- Analyze with Gemini Vision ----
  if (canPublish) {
    void ctx.events!.publish({
      type: "PROGRESS",
      videoId: `channel-style-${userId}`,
      userId,
      progress: 30,
      stage: "Analyzing thumbnail style with AI",
      timestamp: nowIso(),
    });
  }

  const imageGenClient = new ImageGenClient(ctx.env);
  const analysisPrompt = buildStyleAnalysisPrompt({
    channelTitle: channel.channelTitle,
    thumbnailCount: thumbnailUrls.length,
  });

  let analysisText: string;
  try {
    analysisText = await imageGenClient.analyzeImages(thumbnailUrls, analysisPrompt);
  } catch (err) {
    const classified = classifyImageGenError(err);
    if (classified.kind === "permanent") {
      const reason = `[${classified.reasonCode}] ${classified.message}`;
      await markFailed(ctx, userId, reason);
      ctx.logger.warn(
        { userId, reasonCode: classified.reasonCode, message: classified.message },
        "Style analysis failed permanently; not retrying",
      );
      return;
    }

    ctx.logger.warn(
      { userId, reasonCode: classified.reasonCode, message: classified.message },
      "Style analysis failed transiently; BullMQ will retry",
    );
    throw new Error(`[${classified.reasonCode}] ${classified.message}`);
  }

  ctx.logger.info(
    { userId, analysisLength: analysisText.length },
    "Gemini Vision returned style analysis",
  );

  // ---- Parse the result ----
  const parsed = parseStyleAnalysis(analysisText);

  // ---- Upsert the style row ----
  if (canPublish) {
    void ctx.events!.publish({
      type: "PROGRESS",
      videoId: `channel-style-${userId}`,
      userId,
      progress: 80,
      stage: "Saving style profile",
      timestamp: nowIso(),
    });
  }

  try {
    await prisma.channelThumbnailStyle.upsert({
      where: { userId },
      create: {
        userId,
        dominantColors: parsed.dominantColors as unknown as object,
        textPlacement: parsed.textPlacement,
        compositionStyle: parsed.compositionStyle,
        facePresence: parsed.facePresence,
        brandElements: parsed.brandElements as unknown as object,
        analysisRaw: parsed.analysisRaw,
        thumbnailCount: thumbnailUrls.length,
        lastAnalyzedAt: new Date(),
      },
      update: {
        dominantColors: parsed.dominantColors as unknown as object,
        textPlacement: parsed.textPlacement,
        compositionStyle: parsed.compositionStyle,
        facePresence: parsed.facePresence,
        brandElements: parsed.brandElements as unknown as object,
        analysisRaw: parsed.analysisRaw,
        thumbnailCount: thumbnailUrls.length,
        lastAnalyzedAt: new Date(),
      },
    });
  } catch (err) {
    ctx.logger.error(
      { userId, err: err instanceof Error ? err.message : String(err) },
      "Failed to upsert style row — rethrowing for retry",
    );
    throw err;
  }

  // ---- Publish completion events ----
  if (canPublish) {
    void ctx.events!.publish({
      type: "PROGRESS",
      videoId: `channel-style-${userId}`,
      userId,
      progress: 100,
      stage: "Complete",
      timestamp: nowIso(),
    });
    void ctx.events!.publish({
      type: "STATUS_UPDATE",
      videoId: `channel-style-${userId}`,
      userId,
      status: "COMPLETED",
      timestamp: nowIso(),
    });
  }

  ctx.logger.info(
    {
      userId,
      thumbnailCount: thumbnailUrls.length,
      dominantColors: parsed.dominantColors,
      compositionStyle: parsed.compositionStyle,
      facePresence: parsed.facePresence,
    },
    "Channel-style-analyze job completed",
  );
};
