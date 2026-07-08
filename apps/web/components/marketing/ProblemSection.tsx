import * as React from "react";

/**
 * ProblemSection — names the workflow before pitching the fix.
 *
 * PRD §2 spells out the pain verbatim: a creator publishing one video
 * does five disconnected steps, repeats them every week, and stitches
 * together 2-3 separate tools to cover the gap. A visitor who doesn't
 * feel the pain named won't value the fix; this section's only job is
 * to make the workflow feel familiar.
 *
 * Voice rules (Design.md §4) — no poetic cleverness, no "Sunday night"
 * framing, no invented numbers. Just the steps in order and the cost
 * of stitching point solutions together.
 */
const STEPS: ReadonlyArray<{ label: string; detail: string }> = [
  {
    label: "Upload to YouTube Studio",
    detail: "Drag the file in, wait for processing.",
  },
  {
    label: "Pick or design a thumbnail",
    detail: "Open a separate design tool, export, upload again.",
  },
  {
    label: "Re-watch the video to write chapters",
    detail: "Scrub through, type timestamps by hand into the description.",
  },
  {
    label: "Pick a publish time",
    detail: "Guess, or hit \"publish now\" because scheduling is another tool.",
  },
  {
    label: "Repeat next week",
    detail: "Five steps. Four of them don't involve the part of YouTube you enjoy.",
  },
];

export function ProblemSection() {
  return (
    <section
      aria-labelledby="problem-headline"
      className="border-b border-[color:var(--line)] bg-[color:var(--bg)]"
    >
      <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-28">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
          {/* Left: heading + framing copy. */}
          <div>
            <p className="eyebrow mb-4">The current way</p>
            <h2
              id="problem-headline"
              className="text-[clamp(32px,4.5vw,48px)] font-medium leading-[1.05] tracking-[-0.02em] text-[color:var(--ink)]"
            >
              Publishing one video is{" "}
              <span className="display-serif italic">five separate steps.</span>
            </h2>
            <p className="mt-5 max-w-[44ch] text-base leading-relaxed text-[color:var(--ink-muted)]">
              Every week. Across tools that don&apos;t talk to each other. The
              chapter timestamps get typed by hand. The publish time gets
              guessed. The thumbnail gets opened in a fifth tab.
            </p>

            {/* Cost framing — the second half of the PRD §2 pain point:
                paying for 2-3 point solutions. */}
            <div className="mt-8 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-5">
              <p className="eyebrow mb-2">The math right now</p>
              <p className="text-[15px] leading-relaxed text-[color:var(--ink)]">
                <span className="font-mono tabular-nums">$15–$30</span> per
                month per point solution. Most creators pay for{" "}
                <span className="font-mono tabular-nums">two or three</span>{" "}
                of them to cover what should be one workflow.
              </p>
            </div>
          </div>

          {/* Right: the numbered list of steps. */}
          <ol className="space-y-3">
            {STEPS.map((step, i) => (
              <li
                key={step.label}
                className="flex gap-4 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-5"
              >
                <span
                  aria-hidden
                  className="font-mono text-[11px] tabular-nums text-[color:var(--ink-muted)]"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="text-[15px] font-medium leading-snug text-[color:var(--ink)]">
                    {step.label}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-[color:var(--ink-muted)]">
                    {step.detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}