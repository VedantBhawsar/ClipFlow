import Link from "next/link";

import { Button } from "@/components/ui/button";

import { HeroProductCard } from "./hero-product-card";

/**
 * Hero — asymmetric, two-column on desktop, stacked on mobile.
 *
 * Left: eyebrow → three-word headline (Fraunces serif) → body → CTA pair →
 * trust line. The display headlines break visually rather than running
 * into one long sentence; the body fills in the verb.
 *
 * Right: <HeroProductCard /> tilted, glowing, with a secondary card behind
 * it for depth. A quiet gradient orb drifts behind the whole section.
 *
 * Background is the page's bg-background. The orb + grain are part of the
 * `.landing` scope applied at <main>.
 */
export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-12 px-6 pb-24 pt-12 sm:px-10 sm:pb-32 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:items-center lg:gap-16 lg:pb-40 lg:pt-24">
        {/* Left — copy. */}
        <div className="relative">
          <p className="eyebrow reveal reveal-delay-0 mb-6 inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block size-1.5 rounded-full bg-status-ready"
            />
            For YouTube creators
          </p>

          <h1 className="display-serif reveal reveal-delay-1 text-[clamp(64px,9vw,132px)] text-foreground">
            Schedule.
            <br />
            Thumbnail.
            <br />
            <span className="italic text-primary">Ship it.</span>
          </h1>

          <p className="reveal reveal-delay-3 mt-8 max-w-[44ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
            Three things every video needs before it can go live. ClipFlow
            does them for you in one pass — so you can get back to the part
            of YouTube you actually enjoy.
          </p>

          <div className="reveal reveal-delay-4 mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg">
              <Link href="/signup">Start free</Link>
            </Button>
            <Link
              href="/#how"
              className="group inline-flex items-center gap-2 text-sm font-medium text-foreground/80 transition-colors hover:text-foreground"
            >
              <span
                aria-hidden="true"
                className="inline-flex size-7 items-center justify-center rounded-full border border-border bg-card transition-colors group-hover:border-primary group-hover:text-primary"
              >
                <svg viewBox="0 0 12 12" className="size-2.5" fill="currentColor">
                  <path d="M3 2 L10 6 L3 10 Z" />
                </svg>
              </span>
              Watch a 90-sec tour
            </Link>
          </div>

          <p className="reveal reveal-delay-5 mt-6 flex items-center gap-2 text-xs text-muted-foreground">
            <CheckIcon />
            No card required
            <span aria-hidden className="text-border">
              ·
            </span>
            Setup in under 2 minutes
            <span aria-hidden className="text-border">
              ·
            </span>
            Cancel anytime
          </p>
        </div>

        {/* Right — product card. */}
        <div className="relative reveal reveal-delay-3 lg:pl-4">
          <HeroProductCard />
        </div>
      </div>

      {/* Logline strip — sits at the bottom of the hero, hairline above.
          Real pages earn this; ours gets a single confident sentence and
          three stats drawn from what the tool actually produces. */}
      <div className="border-t border-border/60 bg-background/40">
        <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-y-4 px-6 py-8 sm:grid-cols-3 sm:px-10">
          <Logline value="~4 hrs" label="saved per uploaded video" />
          <Logline value="100%" label="of chapters written by ClipFlow" />
          <Logline value="3 clicks" label="from upload to scheduled" />
        </div>
      </div>
    </section>
  );
}

function Logline({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-baseline gap-3 sm:flex-col sm:gap-1">
      <span className="display-serif text-3xl text-foreground sm:text-4xl">
        {value}
      </span>
      <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 14 14"
      className="size-3.5 text-status-ready"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 7.5l3 3 6-7" />
    </svg>
  );
}
