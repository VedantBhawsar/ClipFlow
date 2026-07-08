"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Hero — the highest-leverage section on the page.
 *
 * Two columns on desktop, stacked on mobile:
 *   1. Outcome copy: eyebrow + headline + subheadline + dual CTAs
 *   2. Product card: a faux "Ready to publish" review screen featuring
 *      the status-timeline strip — Design.md's signature element.
 *      Showing this here (above the fold) is deliberate: a returning
 *      user recognises the strip instantly, and a new visitor sees
 *      exactly what "the output looks like" before scrolling.
 *
 * Copy rules (Design.md §4):
 *   • Lead with outcome, not mechanism — "stop doing this by hand",
 *     not "AI-powered". The "without the work" tail lands in italic
 *     serif (the page's display face).
 *   • Subhead names the three automations explicitly (chapters /
 *     thumbnails / scheduling) — these are the named value props from
 *     PRD §1 + §3 Goal 1, so the reader can match them to the next
 *     sections without re-reading.
 *
 * Design.md §2 exception: this is the one legitimate place to break
 * the 28px heading cap. The hero headline scales to clamp(48px,8vw,84px).
 */
export function Hero() {
  return (
    <section
      aria-labelledby="hero-headline"
      className="relative overflow-hidden border-b border-[color:var(--line)]"
    >
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16 lg:py-28">
        {/* Left: outcome copy + CTAs. */}
        <div className="flex flex-col justify-center">
          <p className="eyebrow mb-5">YouTube publishing</p>

          <h1
            id="hero-headline"
            className="text-[clamp(40px,7vw,80px)] font-medium leading-[1.02] tracking-[-0.025em] text-[color:var(--ink)]"
          >
            Stop doing this{" "}
            <span className="text-[color:var(--ink-muted)]">by hand.</span>
            <br />
            <span className="display-serif italic text-[color:var(--ink)]">
              Upload once.
            </span>{" "}
            <span className="display-serif italic text-[color:var(--ink)]">
              Walk away.
            </span>
          </h1>

          <p className="mt-6 max-w-[52ch] text-base leading-relaxed text-[color:var(--ink-muted)] sm:text-lg">
            ClipFlow generates chapters, thumbnails, and the publish time for
            every video. You review the output, approve, and ClipFlow publishes
            to YouTube on schedule.
          </p>

          {/* Dual CTAs. The secondary is a text-link with a small arrow
              rather than a button — the page's conversion principle says
              one primary CTA only, so the secondary must visually defer. */}
          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
            <Button
              asChild
              size="lg"
              className="h-11 rounded-full bg-[color:var(--accent)] px-6 text-[15px] font-medium text-[color:var(--accent-foreground)] hover:bg-[color:var(--accent)]/90"
            >
              <Link href="/signup">Get started</Link>
            </Button>
            <Link
              href="#how"
              className="inline-flex items-center gap-1.5 px-2 py-2 text-sm font-medium text-[color:var(--ink-muted)] underline-offset-4 transition-colors hover:text-[color:var(--ink)] hover:underline"
            >
              See how it works
              <ArrowRightIcon />
            </Link>
          </div>
        </div>

        {/* Right: faux product card. Pure HTML/SVG — no screenshots. */}
        <div className="relative flex items-center justify-center lg:justify-end">
          <HeroProductCard />
        </div>
      </div>
    </section>
  );
}

/**
 * HeroProductCard — the visual artifact on the right side of the hero.
 * A "Ready to publish" review screen mock, designed in code, that
 * shows the status-timeline strip, a chapter list, a thumbnail slot,
 * and a Confirm/Edit pair of buttons.
 *
 * Why mock it: a real screenshot would be stale (Design.md + status
 * values shift with the product), would need device-frame styling, and
 * would force the page to render an image that could shift on
 * network. A code-rendered card ages with the design tokens
 * automatically.
 */
function HeroProductCard() {
  return (
    <div className="relative w-full max-w-[460px] rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)] p-5 shadow-[0_24px_60px_-24px_rgba(26,27,24,0.18)] sm:p-6">
      {/* Header row — title + status */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow mb-1">Video</p>
          <h3 className="truncate text-base font-medium text-[color:var(--ink)]">
            Why I changed my camera setup
          </h3>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[color:var(--status-ready)]/12 px-2 py-0.5 text-[11px] font-medium text-[color:var(--status-ready)]">
          <span aria-hidden className="size-1.5 rounded-full bg-[color:var(--status-ready)]" />
          Ready
        </span>
      </div>

      {/* Status timeline strip — Design.md's signature element. */}
      <div className="mt-5">
        <StatusTimelineStrip currentStage={3} />
      </div>

      {/* Body: thumbnail + chapter list, side-by-side. */}
      <div className="mt-5 grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] gap-4">
        <ThumbnailSlot />
        <ChapterList />
      </div>

      {/* Footer: schedule + actions */}
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-[color:var(--line)] pt-4">
        <div className="min-w-0">
          <p className="eyebrow mb-0.5">Schedule</p>
          <p className="font-mono text-[13px] tabular-nums text-[color:var(--ink)]">
            Thu · 14:00 IST
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            tabIndex={-1}
            className="rounded-full border border-[color:var(--line)] px-3 py-1.5 text-xs font-medium text-[color:var(--ink-muted)]"
          >
            Edit
          </button>
          <button
            type="button"
            tabIndex={-1}
            className="rounded-full bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-[color:var(--accent-foreground)]"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * StatusTimelineStrip — a self-contained version of the signature
 * 5-segment timeline (Design.md §2). The product's app-shell timeline
 * is the same shape; reusing the vocabulary here ties the marketing
 * surface to the in-app product visually.
 *
 * `currentStage` is 1-indexed (1 = Uploaded, 5 = Published).
 * Stages ≤ current are filled; the current one pulses via motion-safe;
 * stages > current are outline-only.
 */
function StatusTimelineStrip({ currentStage }: { currentStage: number }) {
  const stages = ["Uploaded", "Chapters", "Thumbnail", "Scheduled", "Live"];

  return (
    <ol className="flex items-center gap-1.5" aria-label="Publishing progress">
      {stages.map((label, i) => {
        const stage = i + 1;
        const isDone = stage < currentStage;
        const isCurrent = stage === currentStage;
        const isFuture = stage > currentStage;
        return (
          <li
            key={label}
            className="flex flex-1 flex-col items-center gap-1.5"
          >
            <span
              aria-hidden
              className={[
                "h-1.5 w-full rounded-full",
                isDone && "bg-[color:var(--status-ready)]",
                isCurrent && "bg-[color:var(--status-ready)] motion-safe:animate-pulse",
                isFuture && "border border-[color:var(--line)] bg-transparent",
              ]
                .filter(Boolean)
                .join(" ")}
            />
            <span
              className={[
                "font-mono text-[9px] uppercase tracking-[0.14em]",
                isFuture
                  ? "text-[color:var(--ink-muted)]/60"
                  : "text-[color:var(--ink-muted)]",
              ].join(" ")}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * ThumbnailSlot — the small thumbnail frame next to the chapter list.
 * Uses a subtle gradient (the same muted warm-amber / pine / slate
 * hues the app uses for placeholder thumbnails in the review screen)
 * so it reads as "real" without being a fabricated YouTube still.
 */
function ThumbnailSlot() {
  return (
    <div className="relative aspect-video overflow-hidden rounded-md border border-[color:var(--line)]">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, #E8B14A 0%, #2A5C4D 70%, #1A1B18 100%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-x-3 bottom-2 h-2 rounded-sm bg-[color:var(--surface)]/85"
      />
      <div
        aria-hidden
        className="absolute inset-x-3 bottom-5 h-1.5 w-2/3 rounded-sm bg-[color:var(--surface)]/65"
      />
      <span className="absolute right-1.5 top-1.5 rounded-sm bg-[color:var(--surface)]/90 px-1 font-mono text-[9px] tabular-nums text-[color:var(--ink)]">
        1280×720
      </span>
    </div>
  );
}

function ChapterList() {
  const chapters = [
    { t: "0:00", title: "Why I changed" },
    { t: "1:42", title: "The camera upgrade" },
    { t: "4:30", title: "Audio, finally good" },
    { t: "8:05", title: "What I'd skip next time" },
  ];
  return (
    <ul className="space-y-1.5">
      {chapters.map((c, i) => (
        <li
          key={c.t}
          className="flex items-center gap-2 rounded-md border border-transparent px-1.5 py-1 text-[11px]"
          style={
            i === chapters.length - 1
              ? { borderColor: "var(--line)" }
              : undefined
          }
        >
          <span className="font-mono tabular-nums text-[color:var(--ink-muted)]">
            {c.t}
          </span>
          <span className="truncate text-[color:var(--ink)]">{c.title}</span>
        </li>
      ))}
    </ul>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 14 14"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7h8M8 4l3 3-3 3" />
    </svg>
  );
}