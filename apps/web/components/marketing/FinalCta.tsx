import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * FinalCta — the page's last beat, before the footer.
 *
 * Why it exists: the pricing/FAQ section leaves the reader on the
 * "should I sign up?" question. This section answers it with a
 * single primary action and a one-sentence restate of the outcome.
 *
 * Constraints:
 *   • ONE primary CTA. A "secondary" CTA here would be the same as
 *     none — the page has already had four primary CTAs above, and
 *     this is the closing one.
 *   • No "free" claim. PRD §11 leaves a free tier undecided; we do
 *     not promise one.
 *   • No "magic" / "supercharge" / AI-hype. Outcome restated plainly.
 */
export function FinalCta() {
  return (
    <section
      aria-labelledby="final-cta-headline"
      className="border-b border-[color:var(--line)] bg-[color:var(--bg)]"
    >
      <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-28">
        <div className="relative overflow-hidden rounded-3xl border border-[color:var(--line)] bg-[color:var(--surface)] px-6 py-14 sm:px-12 sm:py-20">
          {/* Subtle accent wash in the top-right — the same shape
              language as the hero card, so the page closes where it
              opened. Pure CSS; no image asset. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[color:var(--accent)]/8 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-32 -left-16 size-64 rounded-full bg-[color:var(--accent)]/5 blur-3xl"
          />

          <div className="relative mx-auto max-w-[44rem] text-center">
            <p className="eyebrow mb-4">Ready when you are</p>
            <h2
              id="final-cta-headline"
              className="text-[clamp(32px,4.5vw,48px)] font-medium leading-[1.05] tracking-[-0.02em] text-[color:var(--ink)]"
            >
              Upload once.{" "}
              <span className="display-serif italic">Ship on schedule.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-[46ch] text-base leading-relaxed text-[color:var(--ink-muted)]">
              Chapters, a thumbnail, and a publish time — produced from the
              same upload, on a single subscription. No contracts, cancel from
              your dashboard.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="h-12 w-full rounded-full bg-[color:var(--accent)] px-7 text-sm font-medium text-[color:var(--accent-foreground)] hover:bg-[color:var(--accent)]/90 sm:w-auto"
              >
                <Link href="/signup">Start your first upload</Link>
              </Button>
            </div>

            <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-muted)]">
              Chapters included on every tier
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}