"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, Loader2, Upload, X } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  useCreateVideo,
  useFinalizeUpload,
  useUploadVideo,
  type UploadProgress,
} from "@/hooks/use-videos";
import type { VideoPrivacyStatus } from "@clipflow/types";

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

interface CreateVideoDialogProps {
  /**
   * Whether to render the full-width "Upload your first video" CTA
   * (used in the empty state) or the compact "Upload" button (used in
   * the list header).
   */
  variant?: "empty-state" | "compact";
  /**
   * Disable the trigger. The empty state uses this to gate uploads on
   * YouTube-channel connection.
   */
  disabled?: boolean;
  /**
   * Tooltip text shown when the trigger is disabled. e.g. "Connect
   * your YouTube channel first".
   */
  disabledReason?: string;
}

/**
 * Modal for creating a video + uploading the file.
 *
 * Self-contained: it owns its open state via shadcn's `DialogTrigger`
 * (Radix-backed), so consumers don't have to wire up `open` /
 * `onOpenChange` props. Two internal phases: `"form"` (metadata entry)
 * and `"uploading"` (progress bar + cancel). On submit:
 *   1. createVideo mutation → returns presigned POST URL + fields.
 *   2. uploadVideo(file, presigned, onProgress) → XHR with progress.
 *   3. finalizeUpload(videoId) → server HEADs S3 + enqueues publish.
 *   4. Close modal, refresh video list.
 */
export function CreateVideoDialog({
  variant = "compact",
  disabled = false,
  disabledReason,
}: CreateVideoDialogProps) {
  const router = useRouter();
  const createMutation = useCreateVideo();
  const finalizeMutation = useFinalizeUpload();
  const uploadFn = useUploadVideo();
  const uploadRef = React.useRef<ReturnType<typeof uploadFn> | null>(null);

  const [open, setOpen] = React.useState(false);
  const [phase, setPhase] = React.useState<"form" | "uploading">("form");
  const [progress, setProgress] = React.useState<UploadProgress>({ loaded: 0, total: 0 });
  const [stage, setStage] = React.useState<"uploading" | "finalizing">("uploading");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [createdVideoId, setCreatedVideoId] = React.useState<string | null>(null);

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
      setStage("uploading");
      setErrorMessage(null);
      setCreatedVideoId(null);
      setTagInput("");
    }, 150);
    return () => clearTimeout(id);
  }, [open, reset]);

  // While uploading, intercept Radix's dismiss so a stray Escape or
  // backdrop click can't orphan the in-flight XHR. We expose a single
  // "Cancel" button that's the only way out.
  const dismissDisabled = phase === "uploading";
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (dismissDisabled && !next) return;
      setOpen(next);
    },
    [dismissDisabled],
  );

  const onSubmit = handleSubmit(async (values) => {
    setErrorMessage(null);
    try {
      const scheduledPublishAt = values.scheduledPublishAt
        ? new Date(values.scheduledPublishAt).toISOString()
        : undefined;

      const created = await createMutation.mutateAsync({
        title: values.title,
        description: values.description || undefined,
        tags: values.tags,
        categoryId: values.categoryId,
        privacyStatus: values.privacyStatus,
        ...(scheduledPublishAt ? { scheduledPublishAt } : {}),
        originalFilename: values.file.name,
        contentType: values.file.type || "video/mp4",
        fileSizeBytes: values.file.size,
      });

      setCreatedVideoId(created.id);
      setPhase("uploading");
      setProgress({ loaded: 0, total: values.file.size });

      uploadRef.current = uploadFn(values.file, created, setProgress);
      try {
        await uploadRef.current.promise;
      } catch (err) {
        if ((err as Error).message === "Upload cancelled.") return;
        throw err;
      }

      setStage("finalizing");
      await finalizeMutation.mutateAsync(created.id);

      setOpen(false);
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Upload failed.");
      setPhase("form");
    }
  });

  const handleCancel = () => {
    uploadRef.current?.abort();
    setOpen(false);
  };

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    const current = getValues("tags");
    if (current.includes(tag) || current.length >= 15) return;
    setValue("tags", [...current, tag], { shouldValidate: true });
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    const current = getValues("tags");
    setValue(
      "tags",
      current.filter((t) => t !== tag),
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
        // While uploading, hide Radix's built-in X close so the user
        // can't accidentally dismiss the modal mid-XHR.
        showCloseButton={!dismissDisabled}
        className="max-w-xl"
      >
        {phase === "form" ? (
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
              description={`${tags.length}/15. Press Enter or comma to add.`}
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
                  onBlur={() => {
                    if (tagInput) addTag(tagInput);
                  }}
                  placeholder={tags.length === 0 ? "Type and press Enter…" : ""}
                  className="min-w-[140px] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
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
                {stage === "uploading" ? "Uploading…" : "Finalizing…"}
              </DialogTitle>
              <DialogDescription>
                {stage === "uploading"
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
              {createdVideoId ? (
                <span className="font-mono">
                  id {createdVideoId.slice(0, 12)}…
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
                disabled={stage === "finalizing"}
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