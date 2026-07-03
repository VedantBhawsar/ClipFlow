"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import type {
  Video,
  VideoCommentPolicy,
  VideoLicense,
  VideoPrivacyStatus,
} from "@clipflow/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { useUpdateVideo } from "@/hooks/use-videos";
import { cn } from "@/lib/utils";

/**
 * Which fields can be patched via PATCH /api/videos/:id.
 *
 * Title / description / tags are the user-supplied text fields. The
 * remaining six are the YouTube status block — `videos.insert` accepts
 * them under `status.*` and the publish worker forwards them to
 * YouTube, so a save here is what the user actually ships.
 */
type EditableFields = Pick<
  Video,
  | "title"
  | "description"
  | "tags"
  | "privacyStatus"
  | "madeForKids"
  | "embeddable"
  | "license"
  | "publicStatsViewable"
  | "commentPolicy"
>;

interface VideoDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  video: EditableFields & { id: string };
  /**
   * Called after a successful save so the server-rendered page can
   * show the new values without a full navigation.
   */
  onSaved?: (updated: EditableFields) => void;
}

const TITLE_MAX = 100;
const DESCRIPTION_MAX = 5000;
const TAG_MAX = 30;
const TAGS_MAX = 15;

// ---- YouTube-status option lists ----
//
// Match the values the API's zod schemas accept (see
// `apps/api/src/modules/videos/videos.schemas.ts`). The user-facing
// labels follow Design.md Section 4: plain verbs, no jargon — same
// voice the detail page's formatters already use.

const PRIVACY_OPTIONS: { value: VideoPrivacyStatus; label: string }[] = [
  { value: "private", label: "Private — only you" },
  { value: "unlisted", label: "Unlisted — anyone with the link" },
  { value: "public", label: "Public — anyone can watch" },
];

const COMMENT_POLICY_OPTIONS: {
  value: VideoCommentPolicy;
  label: string;
}[] = [
  { value: "allowAll", label: "Everyone can comment" },
  { value: "holdAll", label: "Hold all for review" },
  { value: "disable", label: "Comments off" },
];

const LICENSE_OPTIONS: { value: VideoLicense; label: string }[] = [
  { value: "standard", label: "Standard YouTube License" },
  { value: "creativeCommon", label: "Creative Commons — Attribution" },
];

export function VideoDetailsDialog({
  open,
  onOpenChange,
  video,
  onSaved,
}: VideoDetailsDialogProps) {
  const [title, setTitle] = React.useState(video.title);
  const [description, setDescription] = React.useState(
    video.description ?? "",
  );
  const [tags, setTags] = React.useState<string[]>([...video.tags]);
  const [tagInput, setTagInput] = React.useState("");

  // YouTube status block — seeded from the row.
  const [privacyStatus, setPrivacyStatus] = React.useState<VideoPrivacyStatus>(
    video.privacyStatus as VideoPrivacyStatus,
  );
  const [commentPolicy, setCommentPolicy] = React.useState<VideoCommentPolicy>(
    video.commentPolicy,
  );
  const [license, setLicense] = React.useState<VideoLicense>(video.license);
  const [madeForKids, setMadeForKids] = React.useState(video.madeForKids);
  const [embeddable, setEmbeddable] = React.useState(video.embeddable);
  const [publicStatsViewable, setPublicStatsViewable] = React.useState(
    video.publicStatsViewable,
  );

  const updateVideo = useUpdateVideo();
  const router = useRouter();

  // Sync draft when the sheet reopens (page re-fetched after save).
  React.useEffect(() => {
    if (open) {
      setTitle(video.title);
      setDescription(video.description ?? "");
      setTags([...video.tags]);
      setTagInput("");
      setPrivacyStatus(video.privacyStatus as VideoPrivacyStatus);
      setCommentPolicy(video.commentPolicy);
      setLicense(video.license);
      setMadeForKids(video.madeForKids);
      setEmbeddable(video.embeddable);
      setPublicStatsViewable(video.publicStatsViewable);
    }
  }, [open, video]);

  const isDirty =
    title.trim() !== video.title ||
    description.trim() !== (video.description ?? "") ||
    tags.join(",") !== video.tags.join(",") ||
    privacyStatus !== video.privacyStatus ||
    commentPolicy !== video.commentPolicy ||
    license !== video.license ||
    madeForKids !== video.madeForKids ||
    embeddable !== video.embeddable ||
    publicStatsViewable !== video.publicStatsViewable;

  const addTag = () => {
    const next = tagInput.trim().slice(0, TAG_MAX);
    if (!next || tags.includes(next) || tags.length >= TAGS_MAX) return;
    setTags([...tags, next]);
    setTagInput("");
  };

  const removeTag = (tag: string) =>
    setTags(tags.filter((t) => t !== tag));

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && tagInput === "" && tags.length > 0) {
      e.preventDefault();
      setTags(tags.slice(0, -1));
    }
  };

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error("Title can't be empty.");
      return;
    }

    try {
      // Partial-merge: only fields that changed appear in the payload.
      // Matches the `'key in input'` semantics the service applies.
      const body: Record<string, unknown> = {};
      if (trimmedTitle !== video.title) body.title = trimmedTitle;
      if (description.trim() !== (video.description ?? ""))
        body.description = description.trim() || null;
      if (tags.join(",") !== video.tags.join(",")) body.tags = tags;
      if (privacyStatus !== video.privacyStatus) body.privacyStatus = privacyStatus;
      if (commentPolicy !== video.commentPolicy) body.commentPolicy = commentPolicy;
      if (license !== video.license) body.license = license;
      if (madeForKids !== video.madeForKids) body.madeForKids = madeForKids;
      if (embeddable !== video.embeddable) body.embeddable = embeddable;
      if (publicStatsViewable !== video.publicStatsViewable)
        body.publicStatsViewable = publicStatsViewable;

      if (Object.keys(body).length === 0) {
        onOpenChange(false);
        return;
      }

      const updated = await updateVideo.mutateAsync({ id: video.id, body });
      toast.success("Details saved.");
      onSaved?.({
        title: updated.title,
        description: updated.description ?? null,
        tags: updated.tags,
        privacyStatus: updated.privacyStatus as VideoPrivacyStatus,
        commentPolicy: updated.commentPolicy,
        license: updated.license,
        madeForKids: updated.madeForKids,
        embeddable: updated.embeddable,
        publicStatsViewable: updated.publicStatsViewable,
      });
      router.refresh();
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't save your edits.",
      );
    }
  };

  const saving = updateVideo.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-[color:var(--line)] pb-4">
          <SheetTitle className="text-[16px] font-medium text-[color:var(--ink)]">
            Edit video details
          </SheetTitle>
          <SheetDescription className="text-[13px] text-[color:var(--ink-muted)]">
            Changes here update the metadata and YouTube status block for this
            video. Save to apply.
          </SheetDescription>
        </SheetHeader>

        {/* Scrollable body — keeps the action footer pinned at the
            bottom regardless of how tall the form grows on small
            viewports. */}
        <div className="flex-1 space-y-6 overflow-y-auto py-5">
          {/* Title */}
          <Field label="Title">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={TITLE_MAX}
              placeholder="Video title"
              className="text-[14px]"
              autoFocus
            />
            <Counter current={title.length} max={TITLE_MAX} />
          </Field>

          {/* Description */}
          <Field label="Description">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={DESCRIPTION_MAX}
              placeholder="Describe your video…"
              className="min-h-[120px] text-[14px]"
            />
            <Counter current={description.length} max={DESCRIPTION_MAX} />
          </Field>

          {/* Tags */}
          <Field label={`Tags (${tags.length}/${TAGS_MAX})`}>
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 focus-within:ring-1 focus-within:ring-[color:var(--accent)]">
              {tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="gap-1 pr-1 text-xs"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    aria-label={`Remove tag "${tag}"`}
                    className="ml-0.5 rounded-sm opacity-70 hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {tags.length < TAGS_MAX ? (
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  maxLength={TAG_MAX}
                  placeholder={tags.length === 0 ? "Add tags…" : ""}
                  className="min-w-[100px] flex-1 bg-transparent text-[13px] outline-none placeholder:text-[color:var(--ink-muted)]"
                  aria-label="Add a tag"
                />
              ) : null}
            </div>
            <p className="text-[11px] text-[color:var(--ink-muted)]">
              Press Enter, Space, or comma to add. Backspace removes the last
              tag.
            </p>
          </Field>

          {/* YouTube status block — sectioned off so the visual weight
              stays manageable. The header is uppercase muted per the
              existing Field label convention. */}
          <div className="space-y-4">
            <p className="text-[12px] font-medium uppercase tracking-wide text-[color:var(--ink-muted)]">
              Audience &amp; visibility
            </p>

            <SelectField
              label="Privacy"
              value={privacyStatus}
              onChange={(v) => setPrivacyStatus(v as VideoPrivacyStatus)}
              options={PRIVACY_OPTIONS}
            />

            <SelectField
              label="Comments"
              value={commentPolicy}
              onChange={(v) => setCommentPolicy(v as VideoCommentPolicy)}
              options={COMMENT_POLICY_OPTIONS}
            />

            <SelectField
              label="License"
              value={license}
              onChange={(v) => setLicense(v as VideoLicense)}
              options={LICENSE_OPTIONS}
            />

            <ToggleRow
              label="Made for kids"
              description="Required by COPPA. Tells YouTube to disable signals like comments and notifications."
              checked={madeForKids}
              onCheckedChange={setMadeForKids}
            />

            <ToggleRow
              label="Embedding"
              description="Allow other websites to embed this video."
              checked={embeddable}
              onCheckedChange={setEmbeddable}
            />

            <ToggleRow
              label="Public stats"
              description="Show the view count and other stats on the watch page."
              checked={publicStatsViewable}
              onCheckedChange={setPublicStatsViewable}
            />
          </div>
        </div>

        <SheetFooter className="border-t border-[color:var(--line)] pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || saving}
          >
            {saving ? "Saving…" : "Save details"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ---- tiny helpers ----

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] font-medium uppercase tracking-wide text-[color:var(--ink-muted)]">
        {label}
      </Label>
      {children}
    </div>
  );
}

/**
 * SelectRow — labelled Select with the same shape as `Field`, used for
 * the YouTube-status enum fields.
 */
function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] font-medium uppercase tracking-wide text-[color:var(--ink-muted)]">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full text-[14px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * ToggleRow — label + description on the left, Switch on the right.
 * Lays out the three Switch fields in the Audience & visibility
 * section so the controls line up with the Select rows above.
 */
function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-[color:var(--line)]/60 bg-[color:var(--surface)] px-3 py-2.5">
      <div className="min-w-0 space-y-0.5">
        <p className="text-[13px] font-medium text-[color:var(--ink)]">
          {label}
        </p>
        <p className="text-[11px] leading-snug text-[color:var(--ink-muted)]">
          {description}
        </p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        label={label}
        className="shrink-0"
      />
    </div>
  );
}

function Counter({ current, max }: { current: number; max: number }) {
  return (
    <p
      className={cn(
        "text-right font-mono text-[11px]",
        current > max * 0.9
          ? "text-[color:var(--status-error)]"
          : "text-[color:var(--ink-muted)]",
      )}
    >
      {current}/{max}
    </p>
  );
}