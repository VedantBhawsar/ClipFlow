import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * CTA band — sits above the footer. Asks the page's last conversion
 * question, with a single primary action and a quiet escape hatch.
 */
export function CtaBand() {
  return (
    <section id="pricing" className="relative border-t border-border/60">
      <div className="mx-auto max-w-[1180px] px-6 py-24 sm:px-10 sm:py-32">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-10 sm:p-16">
          {/* Ambient gradient inside the band — earns its keep by drawing
              the eye to the last CTA on the page. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(60% 60% at 80% 0%, color-mix(in oklab, var(--color-primary) 22%, transparent), transparent 70%)",
            }}
          />
          <div className="relative grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div>
              <p className="eyebrow mb-5">Ready when you are</p>
              <h2 className="display-serif text-4xl text-foreground sm:text-5xl">
                Stop scheduling at 2 a.m.{" "}
                <span className="italic text-primary">Render on Saturday.</span>
              </h2>
              <p className="mt-4 max-w-[44ch] text-base leading-relaxed text-muted-foreground">
                Free while you&apos;re early. Connect YouTube when you publish
                your first video, not before.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3 lg:items-end">
              <Button asChild size="lg" className="px-7 text-base h-12">
                <Link href="/signup">Start free →</Link>
              </Button>
              <p className="text-xs text-muted-foreground">
                Already have an account?{" "}
                <Link
                  href="/signin"
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  Sign in
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
