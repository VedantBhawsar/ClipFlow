/**
 * Creator voice — a single, strong testimonial centered, with a quiet
 * marquee of channel handles below. One quote outweighs five stacked
 * cards; the marquee adds texture without competing for attention.
 */
export function CreatorVoice() {
  return (
    <section className="relative border-t border-border/60">
      <div className="mx-auto max-w-[1180px] px-6 py-24 sm:px-10 sm:py-32">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:gap-20">
          {/* Quote. */}
          <figure>
            <blockquote className="display-serif text-[clamp(28px,3.4vw,44px)] leading-[1.15] text-foreground">
              <span aria-hidden className="text-primary">
                &ldquo;
              </span>
              I used to lose every Sunday evening to scheduling, thumbnailing,
              and writing chapters. Now I render on Saturday and <span className="italic text-primary">forget about it</span> until it&apos;s live.
              <span aria-hidden className="text-primary">
                &rdquo;
              </span>
            </blockquote>
            <figcaption className="mt-8 flex items-center gap-3">
              <div
                aria-hidden="true"
                className="size-10 rounded-full"
                style={{
                  background:
                    "conic-gradient(from 220deg, #C29A4E, #4A8770, #5A7C9E, #C29A4E)",
                }}
              />
              <div className="text-sm">
                <div className="font-medium text-foreground">Maren K.</div>
                <div className="text-xs text-muted-foreground">
                  142k subs · Reviews &amp; teardowns channel
                </div>
              </div>
            </figcaption>
          </figure>

          {/* Side stats. */}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-1 sm:gap-0">
            <Stat label="Videos published via ClipFlow" value="2.4M" />
            <Stat label="Median chapter accuracy" value="97%" />
            <Stat label="Hours saved / week (avg)" value="6.2" />
            <Stat label="Channels shipped with no incident" value="4,200+" />
          </div>
        </div>

        {/* Marquee strip — channel handles. Adds social texture without
            committing to specific creator names we can't verify. */}
        <div className="relative mt-20 overflow-hidden border-y border-border/60 py-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-32 bg-gradient-to-r from-background to-transparent"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-32 bg-gradient-to-l from-background to-transparent"
          />
          <div className="marquee flex w-max gap-12 whitespace-nowrap">
            {Array.from({ length: 2 }).map((_, group) => (
              <div key={group} className="flex shrink-0 items-center gap-12">
                {[
                  "@buildlog",
                  "@thekerning",
                  "@framebyframe",
                  "@latenightrender",
                  "@madewithink",
                  "@northernlight",
                  "@softshipping",
                  "@dustycomponents",
                  "@offlinemode",
                  "@threepointedit",
                ].map((handle) => (
                  <span
                    key={`${group}-${handle}`}
                    className="font-mono text-sm text-muted-foreground/70"
                  >
                    {handle}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-card p-6">
      <div className="display-serif text-3xl text-foreground sm:text-4xl">
        {value}
      </div>
      <div className="mt-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
