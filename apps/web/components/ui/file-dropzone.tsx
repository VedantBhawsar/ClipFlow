"use client";

import * as React from "react";
import { FileVideoIcon, UploadCloudIcon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Drag-and-drop file picker styled to match the rest of the
 * `apps/web/components/ui` design system.
 *
 * Why hand-rolled: there's no first-party shadcn dropzone, and the
 * `react-dropzone` package is overkill for the single-file video
 * picker the upload dialog needs. This is ~150 lines and covers
 * keyboard + pointer parity with native `<input type="file">`.
 *
 * Behavior:
 * - Clicking the empty state opens the system file picker.
 * - Dragging a file onto the zone highlights it; dropping picks it.
 * - Once a file is set, the zone collapses to a compact preview with
 *   name, formatted size, and a remove button.
 * - Files that don't match `accept` are surfaced as `localError`
 *   (not the parent's `error`) so we don't blow up the form just
 *   because the user dragged a `.zip`.
 *
 * Integration with react-hook-form: the parent owns the file value
 * and calls `onFileChange(file | null)` whenever the user picks or
 * removes one. We don't read or write react-hook-form directly so
 * this component stays reusable outside RHF contexts.
 */
export interface FileDropzoneProps {
  /** Currently selected file (or null). Controlled. */
  value: File | null;
  /** Called with the new file (or null when removed). */
  onFileChange: (file: File | null) => void;
  /**
   * Forwarded to the outer wrapper for label `htmlFor` wiring.
   * Falls back to a generated id when omitted.
   */
  id?: string;
  /**
   * `accept` attribute forwarded to the underlying `<input type="file">`.
   * Examples: `"video/*"`, `"video/mp4,video/quicktime"`.
   */
  accept?: string;
  /**
   * Hard size cap in bytes. Defaults to 5 GB — the YouTube upload
   * ceiling — so a too-large drag surfaces a friendly local error
   * instead of failing the presigned-POST 30 seconds in.
   */
  maxSizeBytes?: number;
  /**
   * Optional external error (e.g. from a zod `superRefine`). When
   * present it overrides any local error message so the form-level
   * state stays authoritative.
   */
  error?: string | null;
  /** Short helper text under the zone. */
  description?: string;
  /** Aria label for the file picker trigger. */
  ariaLabel?: string;
  /** Forwarded class for layout flexibility. */
  className?: string;
  /** Disabled state — disables drag/drop and the click trigger. */
  disabled?: boolean;
}

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024 * 1024;

export function FileDropzone({
  value,
  onFileChange,
  id,
  accept = "video/*",
  maxSizeBytes = DEFAULT_MAX_BYTES,
  error,
  description,
  ariaLabel = "Choose a video file",
  className,
  disabled = false,
}: FileDropzoneProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);

  // Clear the local error if the parent clears its own — keeps the
  // two error sources from stacking visually.
  React.useEffect(() => {
    if (error) setLocalError(null);
  }, [error]);

  const acceptFile = React.useCallback(
    (file: File) => {
      // The `accept` attribute is enforced by the OS picker, but the
      // drop path bypasses it, so we re-check here.
      if (accept && !matchesAccept(file, accept)) {
        setLocalError(
          `That file type isn't supported. Please upload ${humanizeAccept(accept)}.`,
        );
        return;
      }
      if (file.size > maxSizeBytes) {
        setLocalError(
          `File is too large (${formatBytes(file.size)}). Maximum allowed is ${formatBytes(maxSizeBytes)}.`,
        );
        return;
      }
      if (file.size === 0) {
        setLocalError("This file appears to be empty. Please pick a different video.");
        return;
      }
      setLocalError(null);
      onFileChange(file);
    },
    [accept, maxSizeBytes, onFileChange],
  );

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) acceptFile(file);
    // Reset the input so picking the same file twice still fires onChange.
    event.target.value = "";
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (disabled) return;
    const file = event.dataTransfer.files?.[0];
    if (file) acceptFile(file);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    // Only set state on enter to avoid re-render storms on over.
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    // `relatedTarget` is null when the cursor leaves the window; that
    // counts as a leave too.
    if (
      !event.relatedTarget ||
      !(event.currentTarget as Node).contains(event.relatedTarget as Node)
    ) {
      setIsDragging(false);
    }
  };

  const openPicker = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPicker();
    }
  };

  const handleRemove = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (disabled) return;
    setLocalError(null);
    onFileChange(null);
  };

  const visibleError = error ?? localError;
  const errorId = React.useId();

  if (value) {
    return (
      <div id={id} className={cn("space-y-1.5", className)}>
        <div
          data-slot="file-dropzone-preview"
          className={cn(
            "flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2.5",
            "border-input",
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground ring-1 ring-inset ring-border">
            <FileVideoIcon className="size-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-sm font-medium text-foreground"
              title={value.name}
            >
              {value.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatBytes(value.size)}
              {value.type ? <> · {value.type}</> : null}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled}
            aria-label={`Remove ${value.name}`}
            className={cn(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground",
              "transition-colors hover:bg-background hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            <XIcon className="size-4" />
          </button>
        </div>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
        {visibleError ? (
          <p id={errorId} role="alert" className="text-xs text-destructive">
            {visibleError}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div id={id} className={cn("space-y-1.5", className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-disabled={disabled || undefined}
        aria-describedby={visibleError ? errorId : undefined}
        onClick={openPicker}
        onKeyDown={handleKeyDown}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        data-state={isDragging ? "active" : "idle"}
        className={cn(
          "group relative flex flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-transparent px-4 py-6 text-center",
          "transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          isDragging
            ? "border-foreground bg-muted/40"
            : "border-input hover:border-foreground/40 hover:bg-muted/30",
          disabled && "cursor-not-allowed opacity-60",
          visibleError && "border-destructive/60",
        )}
      >
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors",
            isDragging && "bg-foreground text-background",
          )}
          aria-hidden
        >
          <UploadCloudIcon className="size-5" />
        </div>
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">
            <span className="text-foreground underline-offset-4 group-hover:underline">
              Click to upload
            </span>{" "}
            or drag and drop
          </p>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          disabled={disabled}
          className="sr-only"
          aria-hidden
          tabIndex={-1}
        />
      </div>
      {visibleError ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {visibleError}
        </p>
      ) : null}
    </div>
  );
}

/* ---------- helpers ---------- */

function matchesAccept(file: File, accept: string): boolean {
  // Accept strings can contain MIME types ("video/mp4") and/or
  // extensions (".mp4"). Wildcards like "video/*" are also valid.
  const tokens = accept
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;

  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  return tokens.some((token) => {
    if (token.startsWith(".")) {
      return name.endsWith(token);
    }
    if (token.endsWith("/*")) {
      const prefix = token.slice(0, -1); // "video/*" -> "video/"
      return mime.startsWith(prefix);
    }
    return mime === token;
  });
}

function humanizeAccept(accept: string): string {
  // Best-effort display: collapse "video/*" to "a video", otherwise
  // list the comma-separated tokens with "or".
  const tokens = accept
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const pretty = tokens.map((t) =>
    t === "video/*"
      ? "a video file"
      : t.startsWith(".")
        ? `a ${t.slice(1).toUpperCase()} file`
        : `a ${t} file`,
  );
  if (pretty.length === 1) return pretty[0]!;
  if (pretty.length === 2) return `${pretty[0]} or ${pretty[1]}`;
  return `${pretty.slice(0, -1).join(", ")}, or ${pretty.at(-1)}`;
}

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}