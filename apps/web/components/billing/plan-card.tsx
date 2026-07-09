"use client";

import { Button } from "@/components/ui/button";
import type { PlanDto } from "@clipflow/types";
import type { PricingPlan } from "@/lib/marketing/pricing";

interface PlanCardProps {
  plan: PlanDto;
  marketingPlan?: PricingPlan;
  current: boolean;
  onSelect: () => void;
  loading?: boolean;
}

export function PlanCard({ plan, marketingPlan, current, onSelect, loading }: PlanCardProps) {
  return (
    <article
      className={[
        "relative flex flex-col rounded-2xl border bg-[color:var(--surface)] p-6 sm:p-7",
        plan.isHighlighted
          ? "border-[color:var(--accent)] shadow-[0_24px_60px_-32px_rgba(42,92,77,0.45)]"
          : "border-[color:var(--line)]",
      ].join(" ")}
    >
      {plan.isHighlighted && (
        <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-[color:var(--accent)] px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--accent-foreground)]">
          Recommended
        </span>
      )}

      <header>
        <h3 className="text-lg font-medium text-[color:var(--ink)]">{plan.name}</h3>
        {marketingPlan && (
          <p className="mt-1 text-[13px] text-[color:var(--ink-muted)]">
            {marketingPlan.tagline}
          </p>
        )}
      </header>

      <div className="mt-6 flex items-baseline gap-1">
        <span className="font-mono text-3xl tabular-nums text-[color:var(--ink)]">
          ${plan.priceUsd}
        </span>
        <span className="text-sm text-[color:var(--ink-muted)]">/mo</span>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 border-y border-[color:var(--line)] py-4">
        <div>
          <dt className="text-[11px] text-[color:var(--ink-muted)]">Videos</dt>
          <dd className="mt-1 font-mono text-lg tabular-nums text-[color:var(--ink)]">
            {plan.videosPerMonth}
            <span className="ml-1 text-xs text-[color:var(--ink-muted)]">/mo</span>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-[color:var(--ink-muted)]">Thumbnails</dt>
          <dd className="mt-1 font-mono text-lg tabular-nums text-[color:var(--ink)]">
            {plan.thumbnailsPerVideo}
            <span className="ml-1 text-xs text-[color:var(--ink-muted)]">/video</span>
          </dd>
        </div>
      </dl>

      {marketingPlan?.features && (
        <ul className="mt-5 space-y-2.5">
          {marketingPlan.features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-[13px] leading-relaxed text-[color:var(--ink)]">
              <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent)]/10 text-[color:var(--accent)]">
                <svg viewBox="0 0 14 14" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.5 7.5l3 3 6-7" />
                </svg>
              </span>
              {f}
            </li>
          ))}
        </ul>
      )}

      <Button
        size="lg"
        className={[
          "mt-7 h-11 rounded-full text-sm font-medium",
          current
            ? "border border-[color:var(--line)] bg-[color:var(--surface)] text-[color:var(--ink)] opacity-60 cursor-default"
            : plan.isHighlighted
              ? "bg-[color:var(--accent)] text-[color:var(--accent-foreground)] hover:bg-[color:var(--accent)]/90"
              : "border border-[color:var(--line)] bg-[color:var(--surface)] text-[color:var(--ink)] hover:border-[color:var(--ink)]/40 hover:bg-[color:var(--surface)]",
        ].join(" ")}
        variant={current ? "outline" : plan.isHighlighted ? "default" : "outline"}
        disabled={current || loading}
        onClick={onSelect}
      >
        {loading ? "Redirecting…" : current ? "Current plan" : "Upgrade"}
      </Button>
    </article>
  );
}