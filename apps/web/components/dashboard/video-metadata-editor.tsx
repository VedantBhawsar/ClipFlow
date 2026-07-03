"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save, X, Plus } from "lucide-react";
import { toast } from "sonner";
import type { Video } from "@clipflow/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateVideo } from "@/hooks/use-videos";
import { cn } from "@/lib/utils";

interface VideoMetadataEditorProps {
  video: Pick<
    Video,
    "id" | "title" | "description" | "tags"
  >;
}

const TITLE_MAX = 100;
const DESCRIPTION_MAX = 5000;
const TAG_MAX = 30;
const TAGS_MAX_COUNT = 15;

type Section = "title" | "description" | "tags";

/**
 * In-place editor for the user-supplied metadata on the review screen
 * (title, description, tags). Mirrors the chapter editor's pattern:
 * each section owns its own draft state and Save button, mutations
 * call the same `PATCH /api/videos/:id` endpoint with the partial
 * payload the section owns.
 *
 * After a successful save we call `router.refresh()` so the
 * server-rendered detail page re-fetches with the new value (the page
 * is an RSC — TanStack invalidation alone won't re-render it). The
 * optimistic `setServerValue` keeps the editor in sync immediately so
 * the next interaction doesn't flash stale text.
 */
export function VideoMetadataEditor({ video }: VideoMetadataEditorProps) {
  // Per-section server-canonical + draft state. Draft resets to server
  // when the user hits Discard.
  const [titleServer, setTitleServer] = React.useState(video.title);
  const [titleDraft, setTitleDraft] = React.useState(video.title);
  const [descriptionServer, setDescriptionServer] = React.useState(
    video.description ?? "",
  );
  const [descriptionDraft, setDescriptionDraft] = React.useState(
    video.description ?? "",
  );
  const [tagsServer, setTagsServer] = React.useState<readonly string[]>(
    video.tags,
  );
  const [tagsDraft, setTagsDraft] = React.useState<readonly string[]>(
    video.tags,
  );

  const [pendingSection, setPendingSection] = React.useState<Section | null>(
    null,
  );
  const [tagDraft, setTagDraft] = React.useState("");

  const updateVideo = useUpdateVideo();
  const router = useRouter();

  const dirty = {
    title: titleDraft.trim() !== titleServer,
    description: descriptionDraft !== descriptionServer,
    tags:
      tagsDraft.length !== tagsServer.length ||
      tagsDraft.some((t, i) => t !== tagsServer[i]),
  };

  const save = async (section: Section) => {
    setPendingSection(section);
    try {
      const body =
        section === "title"
          ? { title: titleDraft.trim() }
          : section === "description"
            ? { description: descriptionDraft.trim() === "" ? null : descriptionDraft }
            : { tags: [...tagsDraft] };
      const updated = await updateVideo.mutateAsync({ id: video.id, body });
      // Optimistically refresh the section that just saved so the
      // editor shows the new canonical value without waiting on the
      // router refresh.
      if (section === "title") {
        setTitleServer(updated.title);
        setTitleDraft(updated.title);
      } else if (section === "description") {
        const next = updated.description ?? "";
        setDescriptionServer(next);
        setDescriptionDraft(next);
      } else {
        setTagsServer(updated.tags);
        setTagsDraft(updated.tags);
      }
      toast.success(
        section === "title"
          ? "Title saved."
          : section === "description"
            ? "Description saved."
            : "Tags saved.",
      );
      // Re-fetch the server-rendered detail page so the header h1 +
      // Details grid reflect the new value.
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't save your edits.",
      );
    } finally {
      setPendingSection(null);
    }
  };

  const discard = (section: Section) => {
    if (section === "title") setTitleDraft(titleServer);
    else if (section === "description") setDescriptionDraft(descriptionServer);
    else setTagsDraft(tagsServer);
  };

  const handleAddTag = () => {
    const next = tagDraft.trim().slice(0, TAG_MAX);
    if (!next) return;
    if (tagsDraft.includes(next)) {
      setTagDraft("");
      return;
    }
    if (tagsDraft.length >= TAGS_MAX_COUNT) return;
    setTagsDraft([...tagsDraft, next]);
    setTagDraft("");
  };

  const handleRemoveTag = (tag: string) => {
    setTagsDraft(tagsDraft.filter((t) => t !== tag));
  };

  return (
    <div className="space-y-6">
      <Section
        title="Title"
        dirty={dirty.title}
        saving={pendingSection === "title"}
        onSave={() => save("title")}
        onDiscard={() => discard("title")}
      >
        <Input
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          maxLength={TITLE_MAX}
          className="text-sm"
          data-testid="metadata-title-input"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          {titleDraft.length}/{TITLE_MAX}
        </p>
      </Section>

      <Section
        title="Description"
        dirty={dirty.description}
        saving={pendingSection === "description"}
        onSave={() => save("description")}
        onDiscard={() => discard("description")}
      >
        <Textarea
          value={descriptionDraft}
          onChange={(e) => setDescriptionDraft(e.target.value)}
          maxLength={DESCRIPTION_MAX}
          className="min-h-32 text-sm"
          data-testid="metadata-description-input"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          {descriptionDraft.length}/{DESCRIPTION_MAX}
        </p>
      </Section>

      <Section
        title="Tags"
        dirty={dirty.tags}
        saving={pendingSection === "tags"}
        onSave={() => save("tags")}
        onDiscard={() => discard("tags")}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {tagsDraft.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="gap-1 pr-1 text-xs"
            >
              {tag}
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                aria-label={`Remove tag ${tag}`}
                className="ml-0.5 rounded-sm hover:bg-foreground/10"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {tagsDraft.length < TAGS_MAX_COUNT ? (
            <div className="flex items-center gap-1">
              <Input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag();
                  } else if (e.key === "," || e.key === " ") {
                    e.preventDefault();
                    handleAddTag();
                  } else if (
                    e.key === "Backspace" &&
                    tagDraft === "" &&
                    tagsDraft.length > 0
                  ) {
                    e.preventDefault();
                    setTagsDraft(tagsDraft.slice(0, -1));
                  }
                }}
                maxLength={TAG_MAX}
                placeholder="Add tag…"
                className="h-7 w-32 text-xs"
                data-testid="metadata-tag-input"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAddTag}
                disabled={tagDraft.trim().length === 0}
                className="h-7 w-7 p-0"
                aria-label="Add tag"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              Maximum {TAGS_MAX_COUNT} tags.
            </span>
          )}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {tagsDraft.length}/{TAGS_MAX_COUNT} tags. Press Enter or space to add.
        </p>
      </Section>
    </div>
  );
}

interface SectionProps {
  title: string;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  children: React.ReactNode;
}

/**
 * One labelled editor row. The Save button is disabled until the user
 * has actually changed something (so we don't burn an API call on a
 * no-op), and the Discard button only appears when dirty.
 */
function Section({
  title,
  dirty,
  saving,
  onSave,
  onDiscard,
  children,
}: SectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-[12px] font-medium uppercase tracking-wide text-[color:var(--ink-muted)]">
          {title}
        </Label>
        <div className="flex items-center gap-2">
          {dirty ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDiscard}
              disabled={saving}
            >
              <X className="h-3.5 w-3.5" />
              Discard
            </Button>
          ) : null}
          <Button
            variant="default"
            size="sm"
            onClick={onSave}
            disabled={!dirty || saving}
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
      <div
        className={cn(
          "rounded-md",
          dirty && "ring-1 ring-[color:var(--accent)]/25",
        )}
      >
        {children}
      </div>
    </div>
  );
}