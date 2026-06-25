"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettings } from "@/hooks/use-settings";
import { useUpdatePreferences } from "@/hooks/use-update-preferences";
import {
  type ChapterBehavior,
  type ThumbnailStyle,
} from "@clipflow/types";

const CHAPTER_BEHAVIOR_OPTIONS: ReadonlyArray<{
  value: ChapterBehavior;
  label: string;
  description: string;
}> = [
  {
    value: "ALWAYS_REVIEW",
    label: "Always review before applying",
    description:
      "Recommended. You'll see every generated chapter list and approve it before publish.",
  },
  {
    value: "AUTO_APPLY_IF_VALID",
    label: "Auto-apply when valid",
    description:
      "Skip the review step when the generated chapters pass YouTube's rules (first=0, min 3, min 10s apart).",
  },
];

const THUMBNAIL_STYLE_OPTIONS: ReadonlyArray<{
  value: ThumbnailStyle;
  label: string;
  description: string;
}> = [
  {
    value: "AUTO",
    label: "Use niche default",
    description: "Pick a style based on your content niche. Recommended for most creators.",
  },
  {
    value: "BOLD",
    label: "Bold",
    description: "High contrast, big text, saturated colors. Good for gaming / entertainment.",
  },
  {
    value: "MINIMAL",
    label: "Minimal",
    description: "Lots of negative space, restrained palette. Good for business / lifestyle.",
  },
  {
    value: "TEXT_FORWARD",
    label: "Text forward",
    description: "Readable headline as the focal point. Good for tutorials and explainers.",
  },
];

export function GenerationForm() {
  const { data: settings } = useSettings();
  const prefs = settings?.preferences ?? null;
  const updatePrefs = useUpdatePreferences();

  const [chapterBehavior, setChapterBehavior] = React.useState<ChapterBehavior>(
    prefs?.chapterBehavior ?? "ALWAYS_REVIEW",
  );
  const [thumbnailStyle, setThumbnailStyle] = React.useState<ThumbnailStyle>(
    prefs?.thumbnailStyle ?? "AUTO",
  );
  const [localError, setLocalError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!prefs) return;
    setChapterBehavior(prefs.chapterBehavior);
    setThumbnailStyle(prefs.thumbnailStyle);
  }, [prefs]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);
    try {
      await updatePrefs.mutateAsync({
        chapterBehavior,
        thumbnailStyle,
      });
      toast.success("Generation preferences saved.");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Couldn't save your generation preferences.");
    }
  };

  const saving = updatePrefs.isPending;
  const error = localError ?? (updatePrefs.error instanceof Error
    ? updatePrefs.error.message
    : null);

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="space-y-6"
      aria-label="Generation form"
    >
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      <FormField
        label="Chapter behavior"
        description="When ClipFlow generates chapters, should it apply them automatically or wait for your review?"
      >
        <Select
          value={chapterBehavior}
          onValueChange={(v) => setChapterBehavior(v as ChapterBehavior)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a behavior" />
          </SelectTrigger>
          <SelectContent>
            {CHAPTER_BEHAVIOR_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {CHAPTER_BEHAVIOR_OPTIONS.find((o) => o.value === chapterBehavior)?.description}
        </p>
      </FormField>

      <FormField
        label="Thumbnail style"
        description="The visual treatment used when generating your thumbnail options."
      >
        <Select
          value={thumbnailStyle}
          onValueChange={(v) => setThumbnailStyle(v as ThumbnailStyle)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a style" />
          </SelectTrigger>
          <SelectContent>
            {THUMBNAIL_STYLE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {THUMBNAIL_STYLE_OPTIONS.find((o) => o.value === thumbnailStyle)?.description}
        </p>
      </FormField>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
