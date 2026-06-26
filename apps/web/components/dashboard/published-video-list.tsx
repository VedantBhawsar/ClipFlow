"use client";

import * as React from "react";
import { keepPreviousData } from "@tanstack/react-query";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import type { VideoPrivacyStatus } from "@clipflow/types";

import { PublishedVideoCard } from "@/components/dashboard/published-video-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useListPublishedVideos } from "@/hooks/use-videos";
import { cn } from "@/lib/utils";

type PrivacyFilter = VideoPrivacyStatus | "all";

const PRIVACY_OPTIONS: ReadonlyArray<{ value: PrivacyFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "public", label: "Public" },
  { value: "unlisted", label: "Unlisted" },
  { value: "private", label: "Private" },
];

/**
 * Date-range buckets shown in the Select. Each maps to a `since` ISO
 * date string the API understands; "all" omits the param entirely.
 *
 * Buckets are coarse on purpose — a published library is scanned by
 * "roughly when," not "Mar 14, 2026 at 09:42." A future slice can
 * add a custom date picker if anyone actually needs that.
 */
const DATE_OPTIONS: ReadonlyArray<{
  value: "all" | "30d" | "1y";
  label: string;
  sinceIso?: string;
}> = [
  { value: "all", label: "All time" },
  {
    value: "30d",
    label: "Last 30 days",
    sinceIso: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    value: "1y",
    label: "Last year",
    sinceIso: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

/**
 * `/dashboard/published` — interactive library view with client-side
 * search + filters + pagination.
 *
 * Layout mirrors the rest of the dashboard (rounded-xl card sections,
 * single-column list, plain headings) so the published page reads as a
 * sibling to `/dashboard`, not a different sub-app.
 *
 * Why client-driven instead of SSR:
 *  - The search box and filter controls can't work over SSR (typed
 *    keystrokes + dropdown changes aren't URL changes), so the page
 *    becomes a client component once we add interactivity. We pay
 *    one extra round-trip on first paint in exchange for instant
 *    search-as-you-type and zero full-page reloads on filter changes.
 *  - The first page still renders meaningful server chrome (sidebar,
 *    header) via the dashboard layout — only the list itself is
 *    client-rendered.
 *
 * Search + filters + pagination are entirely server-side (the API
 * owns the filtering and the page/size slicing — see
 * `videos.service.ts`); this component is purely a presentation layer
 * over the paginated envelope.
 *
 * Empty state: shown when the server returns zero rows. Distinct
 * copy for "no published videos at all" vs. "your filters didn't
 * match anything" — the former invites a new upload, the latter
 * invites clearing the filters.
 */
export function PublishedVideoList() {
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [privacy, setPrivacy] = React.useState<PrivacyFilter>("all");
  const [dateRange, setDateRange] = React.useState<"all" | "30d" | "1y">("all");
  const [page, setPage] = React.useState(1);
  const pageSize = 12;

  const since = dateRange === "all"
    ? undefined
    : (DATE_OPTIONS.find((d) => d.value === dateRange)?.sinceIso ?? undefined);

  // Debounce the text input → applied filter so we don't fire a
  // request on every keystroke. 250ms is the standard "feels instant
  // but doesn't spam the server" mark.
  React.useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  // Non-text filters reset the page immediately — they're discrete
  // clicks, not typed input, so a debounce would just feel laggy.
  React.useEffect(() => {
    setPage(1);
  }, [privacy, dateRange]);

  const query = useListPublishedVideos(
    {
      q: search || undefined,
      privacy,
      ...(since ? { since } : {}),
      page,
      pageSize,
    },
    // Keep the previous page's data on screen while the new page
    // loads — pagination feels broken otherwise (the whole list
    // flashes blank between clicks). `keepPreviousData` is the
    // documented TanStack Query opt-in for this.
    { placeholderData: keepPreviousData },
  );

  const data = query.data;
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const videos = data?.videos ?? [];
  const isFirstLoad = query.isLoading && !query.data;
  const isSearching = query.isFetching && !!query.data;
  const hasActiveFilters = privacy !== "all" || dateRange !== "all" || !!search;

  return (
    <section aria-labelledby="published-heading" className="space-y-4">
      <h2 id="published-heading" className="sr-only">
        Published videos
      </h2>

      {/* Search + filters + count — same rounded-xl card the rest of
          the dashboard uses for content sections. The row is a flex
          container so the search grows to fill, the filters sit to
          its right, and the count line wraps below on narrow screens. */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by title…"
              aria-label="Search published videos"
              className="h-9 pl-9"
            />
          </div>

          <PrivacySegmented value={privacy} onChange={setPrivacy} />

          <Select
            value={dateRange}
            onValueChange={(v) => setDateRange(v as typeof dateRange)}
          >
            <SelectTrigger size="sm" aria-label="Date range" className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            {isSearching ? (
              <Loader2
                className="inline h-3 w-3 animate-spin"
                aria-hidden="true"
              />
            ) : null}
            <span data-testid="published-count">
              {query.isLoading && !data
                ? "Loading…"
                : `${total} video${total === 1 ? "" : "s"}`}
            </span>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                  setPrivacy("all");
                  setDateRange("all");
                  setPage(1);
                }}
                className="rounded-sm text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Body — handles three states: first-load skeleton, populated
          list, and empty (no videos at all vs. no matches). */}
      {isFirstLoad ? (
        <ListSkeleton />
      ) : videos.length === 0 ? (
        total === 0 && !hasActiveFilters ? (
          <EmptyLibrary />
        ) : (
          <EmptySearch
            onClear={() => {
              setSearchInput("");
              setSearch("");
              setPrivacy("all");
              setDateRange("all");
              setPage(1);
            }}
          />
        )
      ) : (
        <>
          <div
            className={cn(
              "space-y-3 transition-opacity duration-150",
              isSearching && "opacity-60",
            )}
            aria-busy={isSearching}
          >
            {videos.map((v) => (
              <PublishedVideoCard key={v.id} video={v} />
            ))}
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            onPageChange={setPage}
            disabled={isSearching}
          />
        </>
      )}
    </section>
  );
}

// ---------- sub-components ----------

/**
 * Inline segmented control for the privacy filter. Buttons are
 * real <button>s with role="radio" + aria-checked so keyboard and
 * screen-reader users get the standard "tab + arrow keys + space"
 * radiogroup semantics — same pattern used by the appearance
 * settings page.
 */
function PrivacySegmented({
  value,
  onChange,
}: {
  value: PrivacyFilter;
  onChange: (next: PrivacyFilter) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Filter by privacy"
      className="inline-flex h-9 items-center rounded-md border border-border bg-background p-0.5"
    >
      {PRIVACY_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "h-8 rounded-sm px-2.5 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-muted text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-xl border border-border bg-card p-4"
        >
          <Skeleton className="h-16 w-28 shrink-0 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyLibrary() {
  return (
    <section
      aria-labelledby="published-empty-title"
      className="rounded-xl border border-dashed border-border bg-card/40 p-8 sm:p-12"
    >
      <div className="flex flex-col items-start gap-3">
        <h2
          id="published-empty-title"
          className="text-lg font-semibold tracking-tight"
        >
          No published videos yet
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Once a video finishes publishing on YouTube it&apos;ll appear
          here — titled, dated, and ready to revisit.
        </p>
      </div>
    </section>
  );
}

function EmptySearch({ onClear }: { onClear: () => void }) {
  return (
    <section
      aria-labelledby="published-search-empty-title"
      className="rounded-xl border border-dashed border-border bg-card/40 p-8 sm:p-12"
    >
      <div className="flex flex-col items-start gap-3">
        <h2
          id="published-search-empty-title"
          className="text-lg font-semibold tracking-tight"
        >
          No matches
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          No published videos match the current search and filters. Try
          a different word, or clear the filters to see your full
          library.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClear}
          className="mt-1"
        >
          Clear filters
        </Button>
      </div>
    </section>
  );
}

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

/**
 * Compact pagination — page range is bounded by `totalPages`, so the
 * only states are prev / next + a "page X of Y" readout + the
 * surrounding item-count line. The button row is keyboard-friendly
 * (real <button> elements with focus rings); the disabled state
 * matches the rest of the design system.
 *
 * We deliberately don't render a 1..N page list — for a v1 library
 * view, prev/next plus a count is enough. A future slice can add a
 * numbered pager if totalPages grows beyond ~10.
 */
function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  disabled,
}: PaginationProps) {
  if (total <= pageSize && totalPages <= 1) return null;

  const firstItem = (page - 1) * pageSize + 1;
  const lastItem = Math.min(total, page * pageSize);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4 text-xs text-muted-foreground"
    >
      <span>
        Showing <span className="text-foreground">{firstItem}</span>–
        <span className="text-foreground">{lastItem}</span> of{" "}
        <span className="text-foreground">{total}</span>
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Prev
        </Button>
        <span>
          Page <span className="text-foreground">{page}</span> of{" "}
          <span className="text-foreground">{totalPages}</span>
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

/**
 * Re-exported so the published page wrapper can use it as the section
 * placeholder while the list query is in its very first load (so the
 * chrome layout doesn't shift when data arrives).
 */
export const PublishedListSkeleton = ListSkeleton;