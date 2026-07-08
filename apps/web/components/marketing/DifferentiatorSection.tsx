import * as React from "react";

/**
 * DifferentiatorSection — the "one tool, not three" comparison.
 *
 * PRD §2 explicitly names the competitive framing: creators stitch
 * together 2-3 point solutions and pay $15-30/mo for each. This
 * section lands that math next to ClipFlow's single price, in the
 * same visual shape, so the visitor doesn't have to do the addition
 * in their head.
 *
 * The left column is the "point solution stack" — three separate
 * products the creator currently has to subscribe to. The right
 * column is ClipFlow at the Creator tier ($35). The math is
 * honest: a creator paying for two of the three is paying more for
 * less. The section lands the comparison; the next section (pricing)
 * handles the per-tier breakdown.
 */
export function DifferentiatorSection() {
  return (
    <section
      aria-labelledby="differentiator-headline"
      className="border-b border-[color:var(--line)] bg-[color:var(--bg)]"
    >
      <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto mb-14 max-w-[40rem] text-center">
          <p className="eyebrow mb-4">One tool, not three</p>
          <h2
            id="differentiator-headline"
            className="text-[clamp(32px,4.5vw,48px)] font-medium leading-[1.05] tracking-[-0.02em] text-[color:var(--ink)]"
          >
            Stop paying for{" "}
            <span className="display-serif italic">the gaps between tools.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
          <PointStackCard />
          <ClipFlowCard />
        </div>

        {/* Supporting sentence: the per-creator learning layer.
            Framed as a contrast with generic point-solution generators
            ("treat every request the same regardless of history") and
            as a direction rather than a finished capability — matches
            the FeatureTrio copy. */}
        <p className="mx-auto mt-10 max-w-[60ch] text-center text-[15px] leading-relaxed text-[color:var(--ink)]">
          Most thumbnail tools treat every request the same regardless of
          history. ClipFlow&apos;s suggestions pick up on which candidates
          you keep versus regenerate, so each new video starts from a tighter
          place than your first one did.
        </p>

        <p className="mx-auto mt-4 max-w-[60ch] text-center text-sm leading-relaxed text-[color:var(--ink-muted)]">
          The math above assumes the Creator tier — the most popular plan for
          a weekly cadence. See the full breakdown in{" "}
          <a
            href="#pricing"
            className="font-medium text-[color:var(--ink)] underline-offset-4 hover:underline"
          >
            Pricing
          </a>
          .
        </p>
      </div>
    </section>
  );
}

function PointStackCard() {
  const tools = [
    { name: "A thumbnail generator", cost: 20 },
    { name: "A clip / scheduler tool", cost: 25 },
    { name: "A separate chapters workflow", cost: 0 },
  ];
  const total = tools.reduce((sum, t) => sum + t.cost, 0);

  return (
    <article
      aria-label="Cost of the point-solution stack"
      className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)] p-6 sm:p-8"
    >
      <header className="mb-6 flex items-baseline justify-between">
        <h3 className="text-lg font-medium text-[color:var(--ink)]">
          The current way
        </h3>
        <span className="font-mono text-xs uppercase tracking-[0.16em] text-[color:var(--ink-muted)]">
          Stack
        </span>
      </header>

      <ul className="space-y-3">
        {tools.map((t) => (
          <li
            key={t.name}
            className="flex items-center justify-between gap-4 border-b border-dashed border-[color:var(--line)] pb-3 last:border-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="text-[15px] text-[color:var(--ink)]">{t.name}</p>
              <p className="mt-0.5 text-xs text-[color:var(--ink-muted)]">
                {t.cost === 0
                  ? "Done by hand — your time"
                  : "Point solution, monthly subscription"}
              </p>
            </div>
            <span className="font-mono text-sm tabular-nums text-[color:var(--ink)]">
              ${t.cost}/mo
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex items-baseline justify-between border-t border-[color:var(--line)] pt-4">
        <p className="text-sm text-[color:var(--ink-muted)]">
          Total, when you pay for all three
        </p>
        <p className="font-mono text-lg tabular-nums text-[color:var(--ink)]">
          ${total}+/mo
        </p>
      </div>
    </article>
  );
}

function ClipFlowCard() {
  return (
    <article
      aria-label="Cost of ClipFlow at the Creator tier"
      className="relative overflow-hidden rounded-2xl border border-[color:var(--accent)]/30 bg-[color:var(--surface)] p-6 sm:p-8"
    >
      <span
        aria-hidden
        className="absolute right-5 top-5 inline-flex items-center gap-1 rounded-full bg-[color:var(--accent)]/12 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--accent)]"
      >
        One bill
      </span>

      <header className="mb-6">
        <h3 className="text-lg font-medium text-[color:var(--ink)]">
          ClipFlow · Creator
        </h3>
        <p className="mt-0.5 text-xs text-[color:var(--ink-muted)]">
          Single subscription, all three jobs
        </p>
      </header>

      <ul className="space-y-3">
        {[
          { name: "Thumbnails", cost: "3 to 10 candidates per video" },
          { name: "Chapters", cost: "Unlimited, included" },
          { name: "Scheduling", cost: "Direct to YouTube" },
        ].map((t) => (
          <li
            key={t.name}
            className="flex items-center justify-between gap-4 border-b border-dashed border-[color:var(--line)] pb-3 last:border-0 last:pb-0"
          >
            <p className="text-[15px] text-[color:var(--ink)]">{t.name}</p>
            <span className="font-mono text-xs text-[color:var(--ink-muted)]">
              {t.cost}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex items-baseline justify-between border-t border-[color:var(--line)] pt-4">
        <p className="text-sm text-[color:var(--ink-muted)]">One bill, monthly</p>
        <p className="font-mono text-lg tabular-nums text-[color:var(--ink)]">
          $35/mo
        </p>
      </div>
    </article>
  );
}