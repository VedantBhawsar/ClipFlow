import * as React from "react";

/**
 * ReassuranceStrip — 3 short factual claims right under the hero.
 *
 * Why this exists: the hero lands on a visitor with no customer logos
 * to back it up. Honest, verifiable reassurances sit closer to the
 * fold than a testimonial section that would have to be invented
 * (ClipFlow hasn't launched publicly).
 *
 * Acceptance criteria require zero fabricated stats, so the copy is
 * deliberately concrete and verifiable — anything that needs a number
 * we can't independently back is rewritten as a mechanism.
 */
const REASSURANCES: ReadonlyArray<{ label: string; detail: string }> = [
  {
    label: "Connect your channel in under a minute",
    detail: "One Google consent. Revoke any time from your Google account.",
  },
  {
    label: "Cancel anytime",
    detail: "Drop back to no-plan at the end of your current cycle.",
  },
  {
    label: "Real frames, not synthetic faces",
    detail: "Thumbnails composite footage from your video. No fake creators.",
  },
  {
    label: "Chapters on every plan",
    detail: "Unlimited per video. Not metered separately.",
  },
];

export function ReassuranceStrip() {
  return (
    <section
      aria-label="What to expect"
      className="border-b border-[color:var(--line)] bg-[color:var(--bg)]"
    >
      <div className="mx-auto max-w-[1200px] px-5 py-10 sm:px-8 sm:py-12">
        <ul className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {REASSURANCES.map((r) => (
            <li key={r.label} className="flex items-start gap-3">
              <CheckmarkIcon />
              <div>
                <p className="text-sm font-medium leading-snug text-[color:var(--ink)]">
                  {r.label}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-[color:var(--ink-muted)]">
                  {r.detail}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function CheckmarkIcon() {
  return (
    <span
      aria-hidden
      className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent)]/10 text-[color:var(--accent)]"
    >
      <svg
        viewBox="0 0 14 14"
        className="size-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2.5 7.5l3 3 6-7" />
      </svg>
    </span>
  );
}