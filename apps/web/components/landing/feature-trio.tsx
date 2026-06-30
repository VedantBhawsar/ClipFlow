/**
 * Feature trio — Schedule / Thumbnail / Chapters.
 *
 * Three vertical columns. Each card has a small product-shaped visual at
 * the top (so the section reads "here's what the tool produces" rather
 * than "here are adjectives about the tool") and a Fraunces title that
 * does the work of an icon + headline + body in one breath.
 */
export function FeatureTrio() {
  return (
    <section id="features" className="relative border-t border-border/60">
      <div className="mx-auto max-w-[1180px] px-6 py-24 sm:px-10 sm:py-32">
        <div className="mb-16 flex flex-col gap-3">
          <p className="eyebrow">The three things every video needs</p>
          <h2 className="display-serif max-w-[18ch] text-4xl text-foreground sm:text-5xl">
            One upload. <span className="italic text-primary">Three jobs done.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FeatureCard
            number="01"
            title="Schedule."
            body="Pick a slot once. ClipFlow publishes — title, description, tags, the works — at the moment your audience is most active."
            bullets={["Weekly recurring slots", "Auto-throttled to channel limits", "Reschedules in one click"]}
          >
            <ScheduleVisual />
          </FeatureCard>

          <FeatureCard
            number="02"
            title="Thumbnail."
            body="Three on-brand variants generated from the frame and the title — pick the one that lands. Custom upload supported."
            bullets={["3 variants per video", "A/B holdouts for any tier", "Bring your own asset"]}
          >
            <ThumbnailVisual />
          </FeatureCard>

          <FeatureCard
            number="03"
            title="Chapters."
            body="ClipFlow listens for topic shifts in your transcript and writes a clean chapter list — same format YouTube uses."
            bullets={["Auto-detected from audio", "Editable before publish", "Written into the description"]}
          >
            <ChaptersVisual />
          </FeatureCard>
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  number,
  title,
  body,
  bullets,
  children,
}: {
  number: string;
  title: string;
  body: string;
  bullets: string[];
  children: React.ReactNode;
}) {
  return (
    <article className="group relative flex flex-col gap-6 overflow-hidden rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/40">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {number}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/60">
          ClipFlow
        </span>
      </div>

      {/* Visual. */}
      <div className="relative">{children}</div>

      <div className="mt-auto space-y-4">
        <h3 className="display-serif text-3xl text-foreground">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
        <ul className="space-y-1.5 border-t border-border/60 pt-4">
          {bullets.map((b) => (
            <li
              key={b}
              className="flex items-start gap-2 font-mono text-[11px] text-foreground/80"
            >
              <span aria-hidden className="mt-1.5 inline-block size-1 rounded-full bg-primary" />
              {b}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

/**
 * Small calendar visual — reads as "the next 12 days, you have slots".
 * Pure CSS / SVG, no images. Shows a focused saturation on one slot.
 */
function ScheduleVisual() {
  return (
    <div className="rounded-lg border border-border/60 bg-background p-3">
      <div className="mb-2 flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
        <span>Nov</span>
        <span className="text-status-scheduled">3 queued</span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 21 }).map((_, i) => {
          const day = i + 1;
          const isQueued = day === 6 || day === 13 || day === 20;
          const isToday = day === 9;
          return (
            <div
              key={day}
              className={[
                "flex aspect-square items-center justify-center rounded-sm font-mono text-[10px]",
                isQueued
                  ? "bg-primary/20 text-primary"
                  : isToday
                    ? "border border-foreground/40 text-foreground"
                    : "text-muted-foreground/70",
              ].join(" ")}
            >
              {day}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-md bg-primary/15 px-2 py-1.5">
        <span className="pulse-dot relative inline-block size-1.5 rounded-full bg-primary text-primary" />
        <span className="font-mono text-[10px] text-foreground/85">
          Nov 13 — 8:00 AM PT
        </span>
      </div>
    </div>
  );
}

/**
 * Three generated thumbnail variants, stacked with slight tilt. Pure CSS
 * gradients — designed, not photographed. Reads as "ClipFlow generated
 * these".
 */
function ThumbnailVisual() {
  return (
    <div className="relative h-[136px]">
      {[
        {
          rotate: "-8deg",
          x: "8%",
          label: "A · bold",
          bg: "linear-gradient(135deg, #C29A4E, #8C5A2E)",
        },
        {
          rotate: "-2deg",
          x: "32%",
          label: "B · clean",
          bg: "linear-gradient(135deg, #5A7C9E, #2A3D52)",
        },
        {
          rotate: "5deg",
          x: "56%",
          label: "C · minimal",
          bg: "linear-gradient(135deg, #4A8770, #1F3D33)",
        },
      ].map((card, i) => (
        <div
          key={i}
          aria-hidden
          className="absolute top-0 aspect-video w-[44%] origin-bottom rounded-md border border-border/70 shadow-md"
          style={{
            transform: `rotate(${card.rotate}) translateX(${card.x})`,
            background: card.bg,
          }}
        >
          <div className="absolute inset-x-2 bottom-2 text-[9px] font-mono text-white/80">
            {card.label}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Chapters visual — a tiny transcript with detected sections highlighted.
 */
function ChaptersVisual() {
  return (
    <div className="space-y-1.5 rounded-lg border border-border/60 bg-background p-3 font-mono text-[10px]">
      <div className="flex items-center justify-between border-b border-border/60 pb-1.5 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        <span>Transcript</span>
        <span className="text-status-ready">5 shifts</span>
      </div>
      {[
        { t: "0:00", w: "why I changed", c: "bg-primary/30 text-primary" },
        { t: "1:42", w: "the camera upgrade", c: "bg-status-scheduled/30 text-status-scheduled" },
        { t: "4:30", w: "audio, finally good", c: "bg-status-scheduled/30 text-status-scheduled" },
        { t: "8:05", w: "what I'd skip", c: "bg-primary/30 text-primary" },
      ].map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-muted-foreground/70">{row.t}</span>
          <span
            className={`inline-block truncate rounded-sm px-1.5 py-0.5 ${row.c}`}
          >
            {row.w}
          </span>
        </div>
      ))}
    </div>
  );
}
