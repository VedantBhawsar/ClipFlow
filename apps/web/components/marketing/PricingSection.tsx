import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  CHECKOUT_HREFS,
  PRICING_PLANS,
  PRICING_FOOTNOTES,
  type PricingPlan,
} from "@/lib/marketing/pricing";

/**
 * PricingSection — three tiers, figures straight from PRD §8.
 *
 * Data source: `lib/marketing/pricing.ts` exports the `PRICING_PLANS`
 * typed array. A free tier is NOT hardcoded here — PRD §11 flags it
 * as an unresolved business decision. When a free tier lands, drop
 * another object into the array; this section picks it up without
 * changes. The pricing config is the single source of truth.
 *
 * Visual: one tier is marked as highlighted (`highlighted: true` in
 * the config). At most one plan should carry that flag — the design
 * intent is "this is the recommended choice" and showing two
 * highlighted cards is the same as showing none.
 */
export function PricingSection() {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-headline"
      className="border-b border-[color:var(--line)] bg-[color:var(--bg)]"
    >
      <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto mb-14 max-w-[40rem] text-center">
          <p className="eyebrow mb-4">Pricing</p>
          <h2
            id="pricing-headline"
            className="text-[clamp(32px,4.5vw,48px)] font-medium leading-[1.05] tracking-[-0.02em] text-[color:var(--ink)]"
          >
            One subscription.{" "}
            <span className="display-serif italic">All three jobs.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-[46ch] text-base leading-relaxed text-[color:var(--ink-muted)]">
            Pay monthly, cancel anytime. Chapters are included on every tier —
            no separate metering, no surprise add-ons.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {PRICING_PLANS.map((plan) => (
            <PricingCard key={plan.id} plan={plan} />
          ))}
        </div>

        {/* Footnotes — pulled from the pricing config so the copy is
            auditable in one place. */}
        <ul className="mx-auto mt-10 grid max-w-3xl grid-cols-1 gap-2 sm:grid-cols-3">
          {PRICING_FOOTNOTES.map((line) => (
            <li
              key={line}
              className="flex items-start gap-2 text-[12px] leading-relaxed text-[color:var(--ink-muted)]"
            >
              <span
                aria-hidden
                className="mt-1.5 inline-block size-1 shrink-0 rounded-full bg-[color:var(--ink-muted)]"
              />
              {line}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function PricingCard({ plan }: { plan: PricingPlan }) {
  const isHighlighted = plan.highlighted === true;

  return (
    <article
      className={[
        "relative flex flex-col rounded-2xl border bg-[color:var(--surface)] p-6 sm:p-7",
        isHighlighted
          ? "border-[color:var(--accent)] shadow-[0_24px_60px_-32px_rgba(42,92,77,0.45)]"
          : "border-[color:var(--line)]",
      ].join(" ")}
    >
      {isHighlighted ? (
        <span
          className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-[color:var(--accent)] px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--accent-foreground)]"
        >
          Recommended
        </span>
      ) : null}

      <header>
        <h3 className="text-lg font-medium text-[color:var(--ink)]">
          {plan.name}
        </h3>
        <p className="mt-1 text-[13px] text-[color:var(--ink-muted)]">
          {plan.tagline}
        </p>
      </header>

      {/* Price block — mono + tabular so the three prices line up
          vertically. The "/mo" suffix sits in a smaller weight so the
          number reads as the primary figure. */}
      <div className="mt-6 flex items-baseline gap-1">
        <span className="font-mono text-3xl tabular-nums text-[color:var(--ink)]">
          ${plan.priceUsd}
        </span>
        <span className="text-sm text-[color:var(--ink-muted)]">/mo</span>
      </div>

      {/* Limits — both figures in mono. These are the two numbers a
          creator scans to decide if the plan fits. */}
      <dl className="mt-5 grid grid-cols-2 gap-3 border-y border-[color:var(--line)] py-4">
        <div>
          <dt className="text-[11px] text-[color:var(--ink-muted)]">Videos</dt>
          <dd className="mt-1 font-mono text-lg tabular-nums text-[color:var(--ink)]">
            {plan.videosPerMonth}
            <span className="ml-1 text-xs text-[color:var(--ink-muted)]">
              /mo
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-[color:var(--ink-muted)]">
            Thumbnails
          </dt>
          <dd className="mt-1 font-mono text-lg tabular-nums text-[color:var(--ink)]">
            {plan.thumbnailsPerVideo}
            <span className="ml-1 text-xs text-[color:var(--ink-muted)]">
              /video
            </span>
          </dd>
        </div>
      </dl>

      {/* Bullets — kept short; the features repeat across tiers on
          purpose (no upsell tricks hiding lower limits). */}
      <ul className="mt-5 space-y-2.5">
        {plan.features.map((f) => (
          <li
            key={f}
            className="flex items-start gap-2 text-[13px] leading-relaxed text-[color:var(--ink)]"
          >
            <span
              aria-hidden
              className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent)]/10 text-[color:var(--accent)]"
            >
              <svg
                viewBox="0 0 14 14"
                className="size-2.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2.5 7.5l3 3 6-7" />
              </svg>
            </span>
            {f}
          </li>
        ))}
      </ul>

      <Button
        asChild
        size="lg"
        className={[
          "mt-7 h-11 rounded-full text-sm font-medium",
          isHighlighted
            ? "bg-[color:var(--accent)] text-[color:var(--accent-foreground)] hover:bg-[color:var(--accent)]/90"
            : "border border-[color:var(--line)] bg-[color:var(--surface)] text-[color:var(--ink)] hover:border-[color:var(--ink)]/40 hover:bg-[color:var(--surface)]",
        ].join(" ")}
        variant={isHighlighted ? "default" : "outline"}
      >
        <Link href={CHECKOUT_HREFS[plan.id]}>{plan.ctaLabel}</Link>
      </Button>
    </article>
  );
}