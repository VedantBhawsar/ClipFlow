"use client";

/**
 * Step 5 of the onboarding wizard (and the same component reused in a
 * Dialog on /dashboard/settings/connected).
 *
 * Lets the user pick up to 4 of their 8 most recent YouTube video
 * thumbnails and have Gemini Vision extract their visual style. The
 * extracted style feeds the existing thumbnail-generation prompt in
 * `apps/worker/src/jobs/thumbnails.ts → buildStyleDescription`, so the
 * personalization kicks in automatically on every new upload.
 *
 * State machine:
 *
 *   idle
 *     └─ connectYouTube (if not connected) → still idle (inline prompt)
 *     └─ fetch() → fetching
 *   fetching
 *     └─ success → reviewing (8 thumbnails, 0 selected)
 *   reviewing
 *     └─ user toggles up to 4 → reviewing (N selected)
 *     └─ user clicks Analyze → analyzing
 *   analyzing
 *     └─ success → done
 *     └─ error   → error
 *   done
 *     └─ auto-advance after 2s OR onComplete callback
 *   error
 *     └─ "Try again" button → idle
 *
 * The component is mounted in two contexts:
 *
 *   - "onboarding" — wizard step 5, after step 4. Renders below the
 *     ProgressDots. The wizard waits for the inner component to call
 *     `onComplete` before routing to /dashboard.
 *   - "settings"   — Dialog on /dashboard/settings/connected, or a
 *     full page at /dashboard/thumbnail-style. The inner component
 *     closes itself via `onComplete` so the parent can dismiss the
 *     Dialog or reset the route.
 */
import { useEffect, useState } from "react";
import { Check, Loader2, Youtube } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useYouTubeConnection } from "@/hooks/use-youtube-connection";
import { useYouTubeOAuthPopup } from "@/hooks/use-youtube-oauth-popup";
import {
  useAnalyzePersonalizedThumbnails,
  useFetchChannelThumbnails,
  type ChannelRecentThumbnail,
} from "@/hooks/use-channel-thumbnails";

const SELECTION_CAP = 4;
const AUTO_ADVANCE_MS = 2_000;

export type QuestionThumbnailStyleVariant = "onboarding" | "settings";

export interface QuestionThumbnailStyleProps {
  /**
   * "onboarding" — wizard step 5 (StepProgressDots above).
   * "settings"   — full page or Dialog on /dashboard/settings/connected.
   */
  variant: QuestionThumbnailStyleVariant;
  /**
   * Called once the user has finished (or skipped) this step. The
   * wizard uses this to advance; the settings Dialog uses it to close.
   */
  onComplete?: () => void;
}

type Phase =
  | { kind: "idle" }
  | { kind: "fetching" }
  | { kind: "reviewing" }
  | { kind: "analyzing" }
  | { kind: "done" }
  | { kind: "error"; message: string };

export function QuestionThumbnailStyle({
  variant,
  onComplete,
}: QuestionThumbnailStyleProps) {
  const connectionQuery = useYouTubeConnection();
  const oauthPopup = useYouTubeOAuthPopup();
  const fetchMutation = useFetchChannelThumbnails();
  const analyzeMutation = useAnalyzePersonalizedThumbnails();

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [thumbnails, setThumbnails] = useState<ChannelRecentThumbnail[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const connection = connectionQuery.data;
  const isConnected = connection?.status === "connected";
  const connectionLoading = connectionQuery.isLoading;

  // Auto-advance after success (only in onboarding mode — the settings
  // Dialog would close on its own, which is jarring).
  useEffect(() => {
    if (phase.kind !== "done") return;
    if (variant !== "onboarding") return;
    const t = setTimeout(() => {
      onComplete?.();
    }, AUTO_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [phase, onComplete, variant]);

  const handleFetch = async () => {
    setPhase({ kind: "fetching" });
    try {
      const result = await fetchMutation.mutateAsync(8);
      setThumbnails(result.items);
      setSelected(new Set());
      setPhase({ kind: "reviewing" });
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to fetch thumbnails.",
      });
    }
  };

  const handleToggle = (url: string) => {
    if (phase.kind !== "reviewing") return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
        return next;
      }
      if (next.size >= SELECTION_CAP) return prev;
      next.add(url);
      return next;
    });
  };

  const handleAnalyze = async () => {
    if (selected.size === 0) return;
    setPhase({ kind: "analyzing" });
    try {
      await analyzeMutation.mutateAsync({
        selectedThumbnailUrls: Array.from(selected),
      });
      setPhase({ kind: "done" });
    } catch (err) {
      setPhase({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Failed to start the style analysis.",
      });
    }
  };

  const handleSkip = () => {
    onComplete?.();
  };

  const handleRetry = () => {
    setPhase({ kind: "idle" });
  };

  // ---- Render: connection loading ----
  if (connectionLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        Checking your YouTube connection…
      </div>
    );
  }

  // ---- Render: not connected → inline "Connect YouTube first" prompt ----
  if (!isConnected) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Youtube className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <CardTitle>Connect YouTube to personalize thumbnails</CardTitle>
          </div>
          <CardDescription>
            We&apos;ll fetch 8 of your most recent video thumbnails and
            extract your style so generated thumbnails match your channel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {oauthPopup.error ? (
            <p className="text-sm text-destructive" role="alert">
              {oauthPopup.error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={oauthPopup.connect}
              disabled={oauthPopup.isBusy}
            >
              {oauthPopup.isBusy ? (
                <>
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  Connecting…
                </>
              ) : (
                "Connect YouTube"
              )}
            </Button>
            <Button type="button" variant="ghost" onClick={handleSkip}>
              Skip for now
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---- Render: idle (connected but no fetch yet) ----
  if (phase.kind === "idle") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pick a few of your recent thumbnails</CardTitle>
          <CardDescription>
            We&apos;ll send 1–4 thumbnails to Gemini Vision to learn your
            style. Channel: <span className="font-medium">{connection?.channelTitle ?? "your channel"}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {fetchMutation.error ? (
            <p className="text-sm text-destructive" role="alert">
              {fetchMutation.error instanceof Error
                ? fetchMutation.error.message
                : "Failed to fetch thumbnails."}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleFetch}>
              Fetch my YouTube thumbnails
            </Button>
            <Button type="button" variant="ghost" onClick={handleSkip}>
              Skip for now
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---- Render: fetching ----
  if (phase.kind === "fetching") {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        Fetching your recent thumbnails…
      </div>
    );
  }

  // ---- Render: reviewing (the 4×2 grid) ----
  if (phase.kind === "reviewing") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Pick up to {SELECTION_CAP} thumbnails that best represent your style.
        </p>
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          role="group"
          aria-label="Select up to four thumbnails"
        >
          {thumbnails.map((thumb) => {
            const isSelected = selected.has(thumb.thumbnailUrl);
            const isDisabled = !isSelected && selected.size >= SELECTION_CAP;
            return (
              <button
                key={thumb.videoId}
                type="button"
                onClick={() => handleToggle(thumb.thumbnailUrl)}
                disabled={isDisabled}
                aria-pressed={isSelected}
                aria-label={
                  isSelected
                    ? `Deselect ${thumb.title}`
                    : `Select ${thumb.title}`
                }
                className={cn(
                  "group relative aspect-video overflow-hidden rounded-lg border-2 text-left transition-colors motion-safe:duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  isSelected
                    ? "border-primary"
                    : "border-border hover:border-foreground/30",
                  isDisabled && "cursor-not-allowed opacity-40",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumb.thumbnailUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                />
                {isSelected ? (
                  <span
                    aria-hidden="true"
                    className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  >
                    <Check className="h-4 w-4" />
                  </span>
                ) : isDisabled ? (
                  <span
                    aria-hidden="true"
                    className="absolute right-2 top-2 rounded-full bg-foreground/70 px-2 py-0.5 text-[10px] font-medium text-background"
                  >
                    Limit reached
                  </span>
                ) : null}
                <span
                  className={cn(
                    "absolute inset-x-0 bottom-0 line-clamp-2 bg-foreground/60 px-2 py-1 text-[11px] text-background",
                    "motion-safe:transition-opacity",
                  )}
                >
                  {thumb.title}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {selected.size} of {SELECTION_CAP} selected.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={handleSkip}>
              Skip
            </Button>
            <Button
              type="button"
              onClick={handleAnalyze}
              disabled={selected.size === 0}
            >
              Analyze selected
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Render: analyzing ----
  if (phase.kind === "analyzing") {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        Sending thumbnails to Gemini Vision…
      </div>
    );
  }

  // ---- Render: done ----
  if (phase.kind === "done") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your channel style is being analyzed</CardTitle>
          <CardDescription>
            We&apos;ll match your style for every new thumbnail from now on.
            {variant === "onboarding"
              ? " Taking you to the dashboard…"
              : " You can close this dialog."}
          </CardDescription>
        </CardHeader>
        {variant === "settings" ? (
          <CardContent>
            <Button type="button" onClick={onComplete}>
              Done
            </Button>
          </CardContent>
        ) : null}
      </Card>
    );
  }

  // ---- Render: error ----
  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle>Something went wrong</CardTitle>
        <CardDescription className="text-destructive">
          {phase.message}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleRetry}>
          Try again
        </Button>
        <Button type="button" variant="ghost" onClick={handleSkip}>
          Skip
        </Button>
      </CardContent>
    </Card>
  );
}