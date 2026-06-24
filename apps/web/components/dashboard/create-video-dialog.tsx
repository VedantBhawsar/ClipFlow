"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Check,
  Link2,
  Loader2,
  RotateCw,
  Upload,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useApi } from "@/hooks/use-api";
import { cn } from "@/lib/utils";
import {
  useCancelPendingUpload,
  useCreateVideo,
  useFinalizeUpload,
  useUploadVideo,
  type UploadProgress,
} from "@/hooks/use-videos";
import type {
  CreateVideoResponse,
  VideoAgeRestriction,
  VideoCommentPolicy,
  VideoLicense,
  VideoPrivacyStatus,
} from "@clipflow/types";

const FIVE_GB = 5 * 1024 * 1024 * 1024;

// YouTube's top categories. "Other" collapses to 22 (People & Blogs) —
// we don't expose every YouTube category in v1.
const CATEGORY_OPTIONS = [
  { value: "1", label: "Film & Animation" },
  { value: "10", label: "Music" },
  { value: "17", label: "Sports" },
  { value: "20", label: "Gaming" },
  { value: "22", label: "People & Blogs" },
  { value: "24", label: "Entertainment" },
  { value: "25", label: "News & Politics" },
  { value: "26", label: "Howto & Style" },
  { value: "27", label: "Education" },
  { value: "28", label: "Science & Technology" },
] as const;

const PRIVACY_OPTIONS: ReadonlyArray<{
  value: VideoPrivacyStatus;
  label: string;
  description: string;
}> = [
  { value: "private", label: "Private", description: "Only you can view" },
  { value: "unlisted", label: "Unlisted", description: "Anyone with the link" },
  { value: "public", label: "Public", description: "Everyone can find it" },
];

// ---- YouTube content controls (status block) ----
//
// These mirror the fields the API stores on the row and the upload
// package sends under `status.*` on `videos.insert`. Defaults match
// YouTube's own defaults so an absent UI choice still produces a
// sensible upload.

const AGE_RESTRICTION_OPTIONS: ReadonlyArray<{
  value: VideoAgeRestriction;
  label: string;
}> = [
  { value: "none", label: "None (default)" },
  { value: "18+", label: "18+ (age restricted)" },
];

const LICENSE_OPTIONS: ReadonlyArray<{
  value: VideoLicense;
  label: string;
  description: string;
}> = [
  {
    value: "standard",
    label: "Standard YouTube license",
    description: "Default — all rights reserved.",
  },
  {
    value: "creativeCommon",
    label: "Creative Commons — Attribution",
    description: "Others can reuse with credit.",
  },
];

const COMMENT_POLICY_OPTIONS: ReadonlyArray<{
  value: VideoCommentPolicy;
  label: string;
  description: string;
}> = [
  {
    value: "allowAll",
    label: "Allow all",
    description: "Comments post automatically.",
  },
  {
    value: "holdAll",
    label: "Hold for review",
    description: "You approve each comment.",
  },
  {
    value: "disable",
    label: "Disable",
    description: "Comments are turned off.",
  },
];

// Validation messages read like product copy, not stack traces.
// Each message tells the user what to do, not what went wrong.
const createVideoFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Please enter a title for your video.")
    .max(100, "Titles can be up to 100 characters."),
  description: z
    .string()
    .max(5000, "Descriptions can be up to 5,000 characters.")
    .optional(),
  tags: z
    .array(z.string().trim().min(1).max(30))
    .max(15, "You can add up to 15 tags.")
    .default([]),
  categoryId: z.string().regex(/^\d{1,2}$/).default("22"),
  privacyStatus: z.enum(["private", "unlisted", "public"]).default("private"),
  scheduledPublishAt: z.string().optional(),
  madeForKids: z.boolean().default(false),
  ageRestriction: z.enum(["none", "18+"]).default("none"),
  embeddable: z.boolean().default(true),
  license: z.enum(["standard", "creativeCommon"]).default("standard"),
  publicStatsViewable: z.boolean().default(true),
  commentPolicy: z
    .enum(["allowAll", "holdAll", "disable"])
    .default("allowAll"),
  file: z
    .instanceof(File, {
      message: "Please select a video file to upload.",
    })
    .refine(
      (f) => f.size > 0,
      "The selected file appears to be empty. Please choose a different video.",
    )
    .refine(
      (f) => f.size <= FIVE_GB,
      "This file exceeds the 5 GB upload limit. Please pick a smaller video.",
    ),
});

type CreateVideoFormValues = z.infer<typeof createVideoFormSchema>;

/**
 * State machine for the dialog body. `form` is the default;
 * `uploading` / `finalizing` are in-progress; `failed` is a terminal
 * "we couldn't commit your upload" state with a Re-upload affordance;
 * `connect-youtube` is the friendly panel shown when the user has no
 * connected YouTube channel.
 *
 * `form | connect-youtube` are the only states the user can dismiss
 * freely; the others lock dismissal so we don't orphan an in-flight
 * XHR / network request.
 */
type Phase = "form" | "uploading" | "finalizing" | "failed" | "connect-youtube";

interface CreateVideoDialogProps {
  /**
   * Whether to render the full-width "Upload your first video" CTA
   * (used in the empty state) or the compact "Upload" button (used in
   * the list header).
   */
  variant?: "empty-state" | "compact";
  /**
   * Disable the trigger. The empty state uses this to gate uploads on
   * YouTube-channel connection — when disabled, opening the dialog
   * shows the "Connect YouTube" panel instead of the form so the user
   * never hits a 412 from the server.
   */
  disabled?: boolean;
  /**
   * Tooltip text shown when the trigger is disabled. e.g. "Connect
   * your YouTube channel first".
   */
  disabledReason?: string;
  /**
   * Whether the user has connected a YouTube channel. When false, the
   * dialog body shows the "Connect YouTube" panel instead of the
   * form. The dashboard page already has this information from the
   * `UserBundleResponse` it fetched server-side; passing it down here
   * avoids an extra round-trip just to know if the upload form should
   * render.
   */
  channelConnected: boolean;
}

/**
 * Modal for creating a video + uploading the file.
 *
 * Self-contained: it owns its open state via shadcn's `DialogTrigger`
 * (Radix-backed), so consumers don't have to wire up `open` /
 * `onOpenChange` props. Body phases:
 *
 *   - `form` (default): the user fills in metadata + picks a file.
 *   - `uploading` / `finalizing`: progress bar + Cancel; locked
 *     against backdrop dismiss.
 *   - `failed`: a server confirmation or upload error happened. Shows
 *     a red error banner with a Re-upload button (re-issues the
 *     S3 PUT with the same `pendingUploadId`, refreshing the
 *     presigned URL if it expired) and a Cancel button (best-effort
 *     S3 + cache cleanup server-side, then close).
 *   - `connect-youtube`: the user has no connected channel. Shows a
 *     "Connect YouTube" panel with a button that takes them to
 *     /dashboard/settings/connected.
 *
 * On submit:
 *   1. `createVideo` mutation → returns presigned POST URL + `pendingUploadId`.
 *   2. `uploadVideo(file, presigned, onProgress)` → XHR with progress.
 *   3. `finalizeUpload(pendingUploadId)` → server HEADs S3, commits
 *      the row, enqueues the publish job.
 *   4. Close modal, refresh video list.
 *
 * No `Video` row is ever created on the server until step 3 succeeds,
 * so an abandoned upload (closed tab, network error, partial PUT)
 * leaves no residue in the DB.
 */
export function CreateVideoDialog({
  variant = "compact",
  disabled = false,
  disabledReason,
  channelConnected,
}: CreateVideoDialogProps) {
  const router = useRouter();
  const api = useApi();
  const createMutation = useCreateVideo();
  const finalizeMutation = useFinalizeUpload();
  const cancelMutation = useCancelPendingUpload();
  const uploadFn = useUploadVideo();
  const uploadRef = React.useRef<ReturnType<typeof uploadFn> | null>(null);

  const [open, setOpen] = React.useState(false);
  // `effectivePhase` keeps the dialog body in `connect-youtube` when
  // the user opens it without a channel, regardless of where the
  // trigger came from (empty state vs list header).
  const [phase, setPhase] = React.useState<Phase>("form");
  const [progress, setProgress] = React.useState<UploadProgress>({ loaded: 0, total: 0 });
  const [pendingUploadId, setPendingUploadId] = React.useState<string | null>(null);
  const [fileRef, setFileRef] = React.useState<File | null>(null);
  const [lastFormValues, setLastFormValues] =
    React.useState<CreateVideoFormValues | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
    setValue,
    getValues,
  } = useForm<CreateVideoFormValues>({
    resolver: zodResolver(createVideoFormSchema),
    defaultValues: {
      title: "",
      description: "",
      tags: [],
      categoryId: "22",
      privacyStatus: "private",
      scheduledPublishAt: "",
      madeForKids: false,
      ageRestriction: "none",
      embeddable: true,
      license: "standard",
      publicStatsViewable: true,
      commentPolicy: "allowAll",
    },
  });

  const tags = watch("tags");
  const privacyStatus = watch("privacyStatus");
  const [tagInput, setTagInput] = React.useState("");

  // Reset state whenever the dialog closes. Use a tiny timeout so the
  // close animation can play unmolested before the form snaps back.
  React.useEffect(() => {
    if (open) return;
    const id = setTimeout(() => {
      reset();
      setPhase("form");
      setProgress({ loaded: 0, total: 0 });
      setPendingUploadId(null);
      setFileRef(null);
      setLastFormValues(null);
      setErrorMessage(null);
      setTagInput("");
    }, 150);
    return () => clearTimeout(id);
  }, [open, reset]);

  // When the dialog opens, snap the body to the right initial phase.
  // `connect-youtube` if no channel (so the user never sees the form
  // when they can't actually upload); `form` otherwise.
  React.useEffect(() => {
    if (!open) return;
    if (!channelConnected) {
      setPhase("connect-youtube");
    } else if (phase !== "uploading" && phase !== "finalizing") {
      setPhase("form");
    }
    // We deliberately don't depend on `phase` here — we only want this
    // to run on `open`/`channelConnected` transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, channelConnected]);

  // While uploading or finalizing, intercept Radix's dismiss so a
  // stray Escape or backdrop click can't orphan the in-flight XHR.
  const dismissLockedPhase = phase === "uploading" || phase === "finalizing";
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (dismissLockedPhase && !next) return;
      setOpen(next);
    },
    [dismissLockedPhase],
  );

  /**
   * The full submit pipeline, used for both the initial submit and
   * Re-upload. `preCreated` is set on Re-upload when the server
   * already minted a `pendingUploadId` (via `getUploadUrl`); for the
   * initial submit it's null and the pipeline mints one via
   * `createVideo`.
   */
  const runUpload = React.useCallback(
    async (
      values: CreateVideoFormValues,
      preCreated: CreateVideoResponse | null,
    ): Promise<void> => {
      setErrorMessage(null);
      setProgress({ loaded: 0, total: values.file.size });

      let presigned = preCreated;
      if (!presigned) {
        const scheduledPublishAt = values.scheduledPublishAt
          ? new Date(values.scheduledPublishAt).toISOString()
          : undefined;
        presigned = await createMutation.mutateAsync({
          title: values.title,
          description: values.description || undefined,
          tags: values.tags,
          categoryId: values.categoryId,
          privacyStatus: values.privacyStatus,
          ...(scheduledPublishAt ? { scheduledPublishAt } : {}),
          madeForKids: values.madeForKids,
          ageRestriction: values.ageRestriction,
          embeddable: values.embeddable,
          license: values.license,
          publicStatsViewable: values.publicStatsViewable,
          commentPolicy: values.commentPolicy,
          originalFilename: values.file.name,
          contentType: values.file.type || "video/mp4",
          fileSizeBytes: values.file.size,
        });
        setPendingUploadId(presigned.pendingUploadId);
      } else {
        setPendingUploadId(presigned.pendingUploadId);
      }

      setPhase("uploading");
      uploadRef.current = uploadFn(values.file, presigned, setProgress);
      try {
        await uploadRef.current.promise;
      } catch (err) {
        if ((err as Error).message === "Upload cancelled.") return;
        throw err;
      }

      setPhase("finalizing");
      await finalizeMutation.mutateAsync(presigned.pendingUploadId);

      setOpen(false);
      router.refresh();
    },
    [createMutation, finalizeMutation, router, uploadFn],
  );

  const onSubmit = handleSubmit(async (values) => {
    setLastFormValues(values);
    setFileRef(values.file);
    try {
      await runUpload(values, null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Upload failed.");
      setPhase("failed");
    }
  });

  /**
   * Re-upload handler. Three paths:
   *  1. Cache hit on the existing `pendingUploadId` → re-issue the
   *     S3 PUT with a fresh presigned URL, then re-finalize. The
   *     `pendingUploadId` is the same so the server's existing
   *     cache entry is used.
   *  2. Cache miss (15-min TTL elapsed) → re-prepare from scratch by
   *     calling `createVideo` again with the original form values.
   *     This mints a new `pendingUploadId` and a fresh S3 key, so
   *     any orphaned partial object from the previous attempt is
   *     harmless (it'll be GC'd by the S3 lifecycle rule).
   *  3. We still have `lastFormValues` but no fileRef (defensive —
   *     shouldn't happen in practice) → fall back to the form.
   */
  const onReupload = React.useCallback(async () => {
    if (!lastFormValues || !fileRef) {
      setPhase("form");
      return;
    }
    // `runUpload` reads `lastFormValues.file` so we hydrate it back
    // into a form-shaped value. `setValue` re-validates the form
    // because we just left a transient state.
    const values: CreateVideoFormValues = {
      ...lastFormValues,
      file: fileRef,
    };
    setValue("file", fileRef, { shouldValidate: false });
    try {
      let preCreated: CreateVideoResponse | null = null;
      if (pendingUploadId) {
        try {
          const fresh = await api.getUploadUrl(pendingUploadId);
          // `fresh` only carries the presigned-URL fields; merge the
          // existing `pendingUploadId` (and the unchanged s3Key from
          // the original create) into the payload the XHR expects.
          // `s3KeyOriginal` is no longer consumed by the client — the
          // server uses it internally — but we keep it on the type
          // for shape compatibility.
          preCreated = {
            pendingUploadId,
            s3KeyOriginal: "",
            postUrl: fresh.postUrl,
            fields: fresh.fields,
            contentLengthMaxBytes: fresh.contentLengthMaxBytes,
          };
        } catch {
          // 404 — pending upload expired in cache. Fall through to
          // createVideo below; the original `pendingUploadId` is
          // already invalidated server-side, so a fresh create is
          // the only path forward.
          preCreated = null;
        }
      }
      await runUpload(values, preCreated);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Upload failed.");
      setPhase("failed");
    }
  }, [api, fileRef, lastFormValues, pendingUploadId, runUpload, setValue]);

  /**
   * Cancel handler for the in-flight upload phase. Aborts the XHR
   * and the dialog stays open (the user can retry by Re-uploading).
   * For the failed phase, Cancel means "give up" — server-side
   * cleanup + close.
   */
  const handleCancel = React.useCallback(async () => {
    if (phase === "uploading" || phase === "finalizing") {
      uploadRef.current?.abort();
      setPhase("form");
      return;
    }
    if (pendingUploadId) {
      try {
        await cancelMutation.mutateAsync(pendingUploadId);
      } catch {
        // Best-effort — the cache will TTL out anyway.
      }
    }
    setOpen(false);
  }, [cancelMutation, pendingUploadId, phase]);

  const handleConnectYouTube = React.useCallback(() => {
    setOpen(false);
    router.push("/dashboard/settings/connected");
  }, [router]);

  const addTag = (raw: string) => {
    // Normalize: trim, collapse internal whitespace, lowercase. YouTube
    // tags are case-insensitive so "Gaming" and "gaming" should be the
    // same tag — we dedup against the lowercased form and store the
    // original casing of the first occurrence.
    const tag = raw.trim().replace(/\s+/g, " ").toLowerCase();
    if (!tag) return;
    const current = getValues("tags");
    if (
      current.some((t) => t.toLowerCase() === tag) ||
      current.length >= 15
    ) {
      setTagInput("");
      return;
    }
    setValue("tags", [...current, tag], { shouldValidate: true });
    setTagInput("");
  };

  const addTagsFromPaste = (raw: string) => {
    // Split on commas / newlines / whitespace — covers "a, b, c",
    // "a\nb\nc", and "a b c" all with one helper.
    for (const piece of raw.split(/[,\n\s]+/)) {
      if (piece.trim()) addTag(piece);
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    const current = getValues("tags");
    setValue(
      "tags",
      current.filter((t) => t.toLowerCase() !== tag.toLowerCase()),
      { shouldValidate: true },
    );
  };

  const percent =
    progress.total > 0
      ? Math.min(100, Math.round((progress.loaded / progress.total) * 100))
      : 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {variant === "empty-state" ? (
          <Button
            disabled={disabled}
            aria-disabled={disabled}
            title={disabled ? disabledReason : "Upload a video"}
            className="mt-2"
          >
            <Upload className="h-4 w-4" />
            Upload your first video
          </Button>
        ) : (
          <Button size="sm" disabled={disabled} title={disabled ? disabledReason : undefined}>
            <Upload className="h-4 w-4" />
            Upload
          </Button>
        )}
      </DialogTrigger>

      <DialogContent
        // While uploading / finalizing, hide Radix's built-in X close
        // so the user can't accidentally dismiss the modal mid-XHR.
        showCloseButton={!dismissLockedPhase}
        // Widened from max-w-xl to fit Audience / Distribution /
        // Comments. lg breakpoint gets extra room for the side-by-side
        // switches under Distribution.
        className="max-w-2xl lg:max-w-3xl max-h-[90vh] overflow-y-scroll"
      >
        {phase === "connect-youtube" ? (
          <div className="flex flex-col gap-5">
            <DialogHeader>
              <DialogTitle>Connect your YouTube channel</DialogTitle>
              <DialogDescription>
                We need access to your YouTube channel to publish your
                videos. Connect once and you&apos;re set.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Not now
              </Button>
              <Button type="button" onClick={handleConnectYouTube}>
                <Link2 className="h-4 w-4" />
                Connect YouTube
              </Button>
            </DialogFooter>
          </div>
        ) : phase === "failed" ? (
          <div className="flex flex-col gap-5">
            <DialogHeader>
              <DialogTitle>Upload didn&apos;t go through</DialogTitle>
              <DialogDescription>
                {errorMessage ??
                  "Something went wrong while sending your video to storage. Try again — the file you picked is still selected."}
              </DialogDescription>
            </DialogHeader>

            {errorMessage ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {errorMessage}
              </div>
            ) : null}

            {fileRef ? (
              <p className="text-xs text-muted-foreground">
                Ready to re-upload:{" "}
                <span className="font-medium text-foreground">
                  {fileRef.name}
                </span>{" "}
                ({formatBytes(fileRef.size)})
              </p>
            ) : null}

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={handleCancel}
                disabled={cancelMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={onReupload}
                disabled={!fileRef || !lastFormValues}
              >
                <RotateCw className="h-4 w-4" />
                Re-upload
              </Button>
            </DialogFooter>
          </div>
        ) : phase === "form" ? (
          <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
            <DialogHeader>
              <DialogTitle>Upload a video</DialogTitle>
              <DialogDescription>
                Pick a file, add metadata, then we&apos;ll publish to your
                channel.
              </DialogDescription>
            </DialogHeader>

            {errorMessage ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {errorMessage}
              </div>
            ) : null}

            <FormField
              label="Title"
              description="Up to 100 characters. This is what viewers see on YouTube."
              error={errors.title?.message}
            >
              <Input
                placeholder="My new video"
                aria-invalid={errors.title ? true : undefined}
                {...register("title")}
              />
            </FormField>

            <FormField
              label="Description"
              description="Optional. Plain text, links welcome."
              error={errors.description?.message}
            >
              <Textarea
                rows={3}
                placeholder="What is this video about?"
                aria-invalid={errors.description ? true : undefined}
                {...register("description")}
              />
            </FormField>

            <FormField
              label="Tags"
              description="Type a tag and press Enter (max 15). Paste a comma-separated list to add many at once."
              error={errors.tags?.message}
            >
              <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1 pr-1">
                    {t}
                    <button
                      type="button"
                      aria-label={`Remove ${t}`}
                      className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                      onClick={() => removeTag(t)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag(tagInput);
                    } else if (
                      e.key === "Backspace" &&
                      tagInput === "" &&
                      tags.length > 0
                    ) {
                      removeTag(tags[tags.length - 1]!);
                    }
                  }}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData("text");
                    if (/[,\n\s]/.test(pasted)) {
                      e.preventDefault();
                      addTagsFromPaste(pasted);
                    }
                  }}
                  onBlur={() => {
                    if (tagInput) addTag(tagInput);
                  }}
                  placeholder={tags.length === 0 ? "Type a tag and press Enter…" : ""}
                  className="min-w-[140px] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted-foreground"
                  aria-describedby="create-video-tags-count"
                />
              </div>
              <p
                id="create-video-tags-count"
                aria-live="polite"
                className="text-xs text-muted-foreground"
              >
                {tags.length} of 15 tags
              </p>
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Category"
                error={errors.categoryId?.message}
              >
                <Controller
                  control={control}
                  name="categoryId"
                  render={({ field, fieldState }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      name={field.name}
                    >
                      <SelectTrigger
                        aria-invalid={fieldState.invalid ? true : undefined}
                        className="w-full"
                      >
                        <SelectValue placeholder="Choose a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>

              <FormField
                label="Publish at"
                description="Leave empty to publish immediately."
                error={errors.scheduledPublishAt?.message}
              >
                <Input
                  type="datetime-local"
                  {...register("scheduledPublishAt")}
                />
              </FormField>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium leading-none text-foreground">
                Privacy
              </legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {PRIVACY_OPTIONS.map((opt) => {
                  const selected = privacyStatus === opt.value;
                  return (
                    <label
                      key={opt.value}
                      className={cn(
                        "flex cursor-pointer items-start gap-2 rounded-md border bg-background p-3 text-sm shadow-xs transition-colors hover:bg-muted/40",
                        selected
                          ? "border-foreground ring-1 ring-foreground/10"
                          : "border-input",
                      )}
                    >
                      <input
                        type="radio"
                        value={opt.value}
                        className="sr-only"
                        {...register("privacyStatus")}
                      />
                      <span
                        className={cn(
                          "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                          selected
                            ? "border-foreground bg-foreground text-background"
                            : "border-input bg-background",
                        )}
                        aria-hidden
                      >
                        {selected ? <Check className="h-3 w-3" /> : null}
                      </span>
                      <span className="flex flex-col gap-0.5">
                        <span className="font-medium leading-none">
                          {opt.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {opt.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* ---- Audience ----
                COPPA self-declaration (`madeForKids`) and YouTube
                content rating. Once `madeForKids = true` lands on
                YouTube it can only be unset via Studio — that's why
                we surface the choice explicitly here. */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium leading-none text-foreground">
                Audience
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Controller
                  control={control}
                  name="madeForKids"
                  render={({ field }) => (
                    <div className="flex flex-col gap-2 rounded-md border border-input bg-background p-3">
                      <span className="text-sm font-medium">
                        Made for kids?
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Required by COPPA. Once set on YouTube, it can
                        only be changed in YouTube Studio.
                      </span>
                      <div className="flex gap-2 pt-1">
                        {(
                          [
                            { value: false, label: "No, it's not" },
                            { value: true, label: "Yes, it's made for kids" },
                          ] as const
                        ).map((opt) => {
                          const selected = field.value === opt.value;
                          return (
                            <button
                              key={String(opt.value)}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              onClick={() => field.onChange(opt.value)}
                              className={cn(
                                "flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                                selected
                                  ? "border-foreground bg-foreground text-background"
                                  : "border-input bg-background hover:bg-muted/40",
                              )}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                />

                <FormField label="Age restriction">
                  <Controller
                    control={control}
                    name="ageRestriction"
                    render={({ field, fieldState }) => (
                      <Select
                        value={field.value}
                        onValueChange={(v) => field.onChange(v as VideoAgeRestriction)}
                        name={field.name}
                      >
                        <SelectTrigger
                          aria-invalid={fieldState.invalid ? true : undefined}
                          className="w-full"
                        >
                          <SelectValue placeholder="No restriction" />
                        </SelectTrigger>
                        <SelectContent>
                          {AGE_RESTRICTION_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </FormField>
              </div>
            </fieldset>

            {/* ---- Distribution ----
                Three toggles / selects the Data API v3 accepts under
                status.* — embeddable, license, publicStatsViewable.
                Switches for the booleans (idiomatic shadcn pattern),
                select for the license enum. */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium leading-none text-foreground">
                Distribution
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Controller
                  control={control}
                  name="embeddable"
                  render={({ field }) => (
                    <SwitchRow
                      label="Allow embedding"
                      description="Other sites can embed this video."
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="publicStatsViewable"
                  render={({ field }) => (
                    <SwitchRow
                      label="Show view count"
                      description="Public stats viewable on the watch page."
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              </div>
              <FormField
                label="License"
                description="Standard keeps all rights reserved. Creative Commons lets others reuse with credit."
              >
                <Controller
                  control={control}
                  name="license"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => field.onChange(v as VideoLicense)}
                      name={field.name}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LICENSE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
            </fieldset>

            {/* ---- Comments ----
                YouTube's three comment policies. Radio cards match
                the Privacy section's visual language. */}
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium leading-none text-foreground">
                Comments
              </legend>
              <div className="grid gap-2">
                {COMMENT_POLICY_OPTIONS.map((opt) => {
                  return (
                    <Controller
                      key={opt.value}
                      control={control}
                      name="commentPolicy"
                      render={({ field }) => {
                        const selected = field.value === opt.value;
                        return (
                          <label
                            className={cn(
                              "flex cursor-pointer items-start gap-2 rounded-md border bg-background p-3 text-sm shadow-xs transition-colors hover:bg-muted/40",
                              selected
                                ? "border-foreground ring-1 ring-foreground/10"
                                : "border-input",
                            )}
                          >
                            <input
                              type="radio"
                              value={opt.value}
                              checked={selected}
                              onChange={() => field.onChange(opt.value)}
                              className="sr-only"
                              name={field.name}
                            />
                            <span
                              className={cn(
                                "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                                selected
                                  ? "border-foreground bg-foreground text-background"
                                  : "border-input bg-background",
                              )}
                              aria-hidden
                            >
                              {selected ? <Check className="h-3 w-3" /> : null}
                            </span>
                            <span className="flex flex-col gap-0.5">
                              <span className="font-medium leading-none">
                                {opt.label}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {opt.description}
                              </span>
                            </span>
                          </label>
                        );
                      }}
                    />
                  );
                })}
              </div>
            </fieldset>

            {/* File picker uses the new dropzone rather than the native
                `<input type="file">`. The dropzone has its own error
                rendering (local + form-level), so we don't wrap it in
                <FormField> to avoid a doubled error message. The label
                and description match FormField's rhythm. */}
            <div className="space-y-1.5">
              <label
                htmlFor="create-video-file"
                className="text-sm font-medium leading-none text-foreground"
              >
                Video file
              </label>
              <p className="text-xs text-muted-foreground">
                MP4, MOV, or WebM. Up to 5 GB.
              </p>
              <Controller
                control={control}
                name="file"
                render={({ field, fieldState }) => (
                  <FileDropzone
                    id="create-video-file"
                    value={field.value ?? null}
                    onFileChange={field.onChange}
                    accept="video/*"
                    maxSizeBytes={FIVE_GB}
                    error={fieldState.error?.message}
                    ariaLabel="Choose a video file to upload"
                  />
                )}
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Upload
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="flex flex-col gap-5">
            <DialogHeader>
              <DialogTitle>
                {phase === "uploading" ? "Uploading…" : "Finalizing…"}
              </DialogTitle>
              <DialogDescription>
                {phase === "uploading"
                  ? "Streaming your video to storage. You can cancel until the upload completes."
                  : "Confirming the upload and queuing the publish job."}
              </DialogDescription>
            </DialogHeader>

            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full bg-foreground transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="flex items-baseline justify-between text-xs text-muted-foreground">
              <span>
                {formatBytes(progress.loaded)} of {formatBytes(progress.total)}{" "}
                ({percent}%)
              </span>
              {pendingUploadId ? (
                <span className="font-mono">
                  id {pendingUploadId.slice(0, 12)}…
                </span>
              ) : null}
            </div>

            {errorMessage ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {errorMessage}
              </div>
            ) : null}

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={handleCancel}
                disabled={phase === "finalizing"}
              >
                Cancel
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const formatBytes = (n: number): string => {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
};

interface SwitchRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}

/**
 * Two-line switch row used by the Distribution section.
 * Label on the left, switch on the right; description underneath the
 * label so the row stays single-line on `sm+`.
 */
function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
}: SwitchRowProps) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-input bg-background p-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium leading-none">{label}</span>
        {description ? (
          <span className="text-xs text-muted-foreground">{description}</span>
        ) : null}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        label={label}
      />
    </div>
  );
}
