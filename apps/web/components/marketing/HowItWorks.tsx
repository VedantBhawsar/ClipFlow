import * as React from "react";

/**
 * HowItWorks — the 4-step pipeline that maps to AppFlow §2-§5.
 *
 * The mapping is deliberate: this section is the visitor's preview of
 * the actual product flow. Each step names the system event from the
 * AppFlow doc so the promise is concrete, not "AI magic".
 *
 *  1. Upload         — AppFlow §2 (drag file in, server gets a presigned
 *                       S3 URL, browser uploads directly).
 *  2. Auto-process   — AppFlow §3 (ingest → transcript → chapters and
 *                       thumbnails run in parallel). This is the "they
 *                       arrive" moment — Design.md §3 reserves the one
 *                       delight motion for this; the marketing preview
 *                       references the concept, doesn't reimplement it.
 *  3. Review         — AppFlow §4 (chapters editable inline, thumbnails
 *                       pickable, regenerate from the same pool).
 *  4. Schedule       — AppFlow §5 (date/time picker, then publish).
 */
const STEPS: ReadonlyArray<{
  n: string;
  title: string;
  detail: string;
}> = [
  {
    n: "01",
    title: "Upload",
    detail:
      "Drop the final render in. ClipFlow stores it and starts the pipeline.",
  },
  {
    n: "02",
    title: "Auto-process",
    detail:
      "Transcript, chapter markers, and thumbnail candidates generate in parallel. Both jobs run side-by-side; nothing makes you wait for the other.",
  },
  {
    n: "03",
    title: "Review & approve",
    detail:
      "Edit chapters inline. Pick a thumbnail or regenerate from the same pool. Nothing leaves your draft until you approve.",
  },
  {
    n: "04",
    title: "Schedule & publish",
    detail:
      "Pick a slot. ClipFlow uploads to YouTube in private state, sets publishAt, and YouTube flips it live at the time you chose.",
  },
];

export function HowItWorks() {
  return (
    <section
      id="how"
      aria-labelledby="how-headline"
      className="border-b border-[color:var(--line)] bg-[color:var(--surface)]"
    >
      <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto mb-14 max-w-[42rem] text-center">
          <p className="eyebrow mb-4">How it works</p>
          <h2
            id="how-headline"
            className="text-[clamp(32px,4.5vw,48px)] font-medium leading-[1.05] tracking-[-0.02em] text-[color:var(--ink)]"
          >
            From finished render{" "}
            <span className="display-serif italic">to live.</span>{" "}
            Four steps.
          </h2>
        </div>

        <ol className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <li
              key={step.n}
              className="relative rounded-xl border border-[color:var(--line)] bg-[color:var(--bg)] p-6"
            >
              <p
                aria-hidden
                className="font-mono text-[11px] tabular-nums text-[color:var(--ink-muted)]"
              >
                {step.n}
              </p>
              <h3 className="mt-4 text-[22px] font-medium leading-[1.1] tracking-[-0.01em] text-[color:var(--ink)]">
                {step.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-[color:var(--ink-muted)]">
                {step.detail}
              </p>
            </li>
          ))}
        </ol>

        {/* Reassurance row — typical-time promise, kept honest. The 10-minute
            figure is from TechSpec §6 (informal SLA, not contractual). */}
        <p className="mx-auto mt-12 max-w-[60ch] text-center text-sm leading-relaxed text-[color:var(--ink-muted)]">
          Typical 10-minute video: pipeline finishes in under 10 minutes.
          Everything after that is review and scheduling.
        </p>
      </div>
    </section>
  );
}