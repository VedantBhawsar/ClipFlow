"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { usePublishVideo } from "@/hooks/use-videos";
import { useSettings } from "@/hooks/use-settings";
import { formatPrivacy } from "@/lib/voice";
import { cn } from "@/lib/utils";

/**
 * Which fields the sheet needs off the `Video` row. The page passes
 * the minimum set the Sheet actually renders — title (for context)
 * and privacyStatus (for the "Privacy will be: …" affordance).
 */
export interface PublishVideoSheetVideo {
  id: string;
  title: string;
  privacyStatus: string;
}

interface PublishSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  video: PublishVideoSheetVideo;
}

// ---- Client-side validation bounds ----
//
// Mirror `publishVideoSchema` in `apps/api/src/modules/videos/videos.schemas.ts`.
// The server is the source of truth, but live client-side checks give
// the user instant feedback on bad input — they shouldn't have to
// round-trip just to learn they picked a time 10 minutes from now.

const MIN_LEAD_MS = 15 * 60 * 1000;
const MAX_LEAD_MS = 60 * 24 * 60 * 60 * 1000;

type Validation =
  | { ok: true; error: null }
  | { ok: false; error: string };

/**
 * Validate a `datetime-local` string (the raw input value, in the
 * format the browser returns: `YYYY-MM-DDTHH:mm`, no timezone marker).
 *
 * `null`/empty = publish-now path, which is always valid. Anything
 * else is parsed with `new Date(...)` — `new Date("")` is `Invalid
 * Date`, so we treat the empty case before reaching the parser.
 */
const validateScheduledAt = (value: string): Validation => {
  if (!value) return { ok: true, error: null };
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) {
    return { ok: false, error: "Schedule time is invalid." };
  }
  const now = Date.now();
  if (ts <= now) {
    return { ok: false, error: "Schedule time must be in the future." };
  }
  if (ts - now < MIN_LEAD_MS) {
    return {
      ok: false,
      error:
        "YouTube requires at least 15 min between now and the scheduled time.",
    };
  }
  if (ts - now > MAX_LEAD_MS) {
    return { ok: false, error: "Scheduled time must be within 60 days." };
  }
  return { ok: true, error: null };
};

/**
 * Right-edge action Sheet for publishing (or scheduling) a video
 * that's in `READY_FOR_REVIEW` / `PUBLISH_FAILED`.
 *
 * Empty datetime = publish now. Filled datetime = schedule. On
 * success the sheet closes, a toast lands, and the user is
 * redirected to `/dashboard/published` (the user-driven flow is
 * intentionally a one-way trip — once they've committed, we send
 * them to the result page).
 *
 * `onSaved` is intentionally omitted: the sheet owns its own
 * navigation. A future caller that wants the user to stay on the
 * detail page can use `usePublishVideo` directly.
 */
export function PublishSheet({
  open,
  onOpenChange,
  video,
}: PublishSheetProps) {
  const router = useRouter();
  const publishVideo = usePublishVideo();
  const { data: settings } = useSettings();

  const [scheduledAt, setScheduledAt] = React.useState("");

  // Reset the draft every time the sheet reopens (page re-fetched,
  // user closed + reopened, etc.). Mirrors the existing
  // `VideoDetailsDialog` reopen-sync pattern.
  React.useEffect(() => {
    if (open) setScheduledAt("");
  }, [open]);

  const validation = React.useMemo(
    () => validateScheduledAt(scheduledAt),
    [scheduledAt],
  );

  const timezoneLabel = settings?.preferences?.defaultTimezone ?? null;

  const handleSubmit = async () => {
    if (!validation.ok) return;
    try {
      await publishVideo.mutateAsync({
        id: video.id,
        body: scheduledAt
          ? { scheduledPublishAt: new Date(scheduledAt).toISOString() }
          : {},
      });
      toast.success("Video published.");
      onOpenChange(false);
      // Defer the redirect until the Sheet's close animation finishes
      // — pushing immediately can race the dialog exit transition and
      // feel jarring. 200ms matches the radix data-state duration
      // (data-[state=closed]:duration-300 in the Sheet primitive).
      setTimeout(() => {
        router.push("/dashboard/published");
      }, 200);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't publish your video.",
      );
    }
  };

  const saving = publishVideo.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-[color:var(--line)] pb-4">
          <SheetTitle className="text-[16px] font-medium text-[color:var(--ink)]">
            Publish video
          </SheetTitle>
          <SheetDescription className="text-[13px] text-[color:var(--ink-muted)]">
            Choose when to publish. Leave empty to publish now.
          </SheetDescription>
        </SheetHeader>

        <div
          className="flex-1 space-y-6 overflow-y-auto py-5"
          data-testid="publish-sheet-body"
        >
          {/* Video context — read-only, so the user is confident
              they're publishing the right row. */}
          <div className="space-y-1.5">
            <Label className="text-[12px] font-medium uppercase tracking-wide text-[color:var(--ink-muted)]">
              Video
            </Label>
            <p
              className="line-clamp-2 text-[14px] text-[color:var(--ink)]"
              data-testid="publish-sheet-title"
            >
              {video.title}
            </p>
          </div>

          {/* Schedule — the only field the user can edit. Everything
              else in the publish payload (privacy, license, etc.)
              was set in the EditDetails sheet. */}
          <div className="space-y-1.5">
            <Label
              htmlFor="publish-scheduled-at"
              className="text-[12px] font-medium uppercase tracking-wide text-[color:var(--ink-muted)]"
            >
              Schedule (optional — leave empty to publish now)
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="publish-scheduled-at"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                disabled={saving}
                className="text-[14px]"
                data-testid="publish-sheet-datetime"
                aria-describedby="publish-sheet-timezone-hint"
                aria-invalid={!validation.ok}
              />
              {timezoneLabel ? (
                <span
                  className="font-mono text-[12px] text-[color:var(--ink-muted)]"
                  data-testid="publish-sheet-timezone"
                >
                  ({timezoneLabel})
                </span>
              ) : null}
            </div>
            <p
              id="publish-sheet-timezone-hint"
              className="text-[11px] text-[color:var(--ink-muted)]"
            >
              This is your saved default. Change in Settings → Scheduling.
            </p>
            {validation.error ? (
              <p
                role="alert"
                className="text-[11px] text-[color:var(--status-error)]"
                data-testid="publish-sheet-error"
              >
                {validation.error}
              </p>
            ) : null}
          </div>

          {/* Privacy — read-only, so the user can double-check the
              row's existing setting before pulling the trigger. */}
          <div className="space-y-1.5">
            <Label className="text-[12px] font-medium uppercase tracking-wide text-[color:var(--ink-muted)]">
              Privacy
            </Label>
            <p
              className="text-[14px] text-[color:var(--ink)]"
              data-testid="publish-sheet-privacy"
            >
              {formatPrivacy(video.privacyStatus)}
            </p>
            <p className="text-[11px] text-[color:var(--ink-muted)]">
              Editing privacy is in the <span className="font-medium">Edit details</span> sheet.
            </p>
          </div>
        </div>

        <SheetFooter className="border-t border-[color:var(--line)] pt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleSubmit}
            disabled={!validation.ok || saving}
            data-testid="publish-sheet-submit"
            className={cn(saving && "cursor-not-allowed")}
          >
            {saving ? (
              <>
                <Loader2
                  className="mr-1.5 h-4 w-4 animate-spin motion-safe:animate-spin"
                  aria-hidden="true"
                />
                Publishing…
              </>
            ) : (
              "Publish"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
