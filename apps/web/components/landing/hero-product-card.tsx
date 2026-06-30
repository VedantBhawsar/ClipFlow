/**
 * Faux product UI used as the hero visual.
 *
 * Not a screenshot, not an illustration — a real-feeling card that shows
 * what ClipFlow produces: a generated thumbnail, a schedule line, and a
 * chapter list. Designed first; the copy and timestamps are illustrative.
 *
 * Pure server component, no motion library — the parent hero applies the
 * reveal/float animations at the wrapper level so the card stays declarative.
 */
export function HeroProductCard() {
  return (
    <div className="relative isolate">
      {/* Secondary card peeking out from behind. Creates depth and
          implies "there's more here" — the user's eye registers the stack. */}
      <div
        aria-hidden="true"
        className="absolute -right-3 top-6 hidden h-full w-[88%] rounded-2xl border border-border/60 bg-card/40 opacity-60 blur-[2px] sm:block"
        style={{ transform: "rotate(3deg) translateY(8px)" }}
      />

      {/* Main card. */}
      <div className="glow float relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* Window chrome — small dots top-left to read as a real app surface. */}
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="block size-2.5 rounded-full bg-destructive/70" />
            <span className="block size-2.5 rounded-full bg-[color:var(--status-processing)]/70" />
            <span className="block size-2.5 rounded-full bg-status-ready/70" />
          </div>
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <span className="pulse-dot relative inline-block size-1.5 rounded-full bg-status-ready text-status-ready" />
            Ready to publish
          </div>
          <div className="text-[10px] font-mono text-muted-foreground/70">
            clipflow.app
          </div>
        </div>

        <div className="space-y-4 p-5">
          {/* Thumbnail — designed, not photographic. Layered gradient with
              a chunky display number ("05") + title overlay reads like a
              high-quality YouTube thumbnail at a glance. */}
          <div className="relative aspect-video w-full overflow-hidden rounded-lg">
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(120% 80% at 80% 20%, #C29A4E 0%, #8C5A2E 45%, #2A1810 100%)",
              }}
            />
            <div
              className="absolute inset-0 mix-blend-overlay opacity-40"
              style={{
                background:
                  "linear-gradient(135deg, transparent 30%, rgba(255,210,140,0.4) 60%, transparent 90%)",
              }}
            />
            <div className="absolute inset-0 flex flex-col justify-between p-4">
              <div className="flex items-start justify-between">
                <span className="rounded-sm bg-black/50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-white/90 backdrop-blur-sm">
                  4K · 12:48
                </span>
                <span className="font-mono text-[10px] text-white/60">EP.05</span>
              </div>
              <div>
                <p className="display-serif text-[26px] font-medium leading-[0.95] text-white/95">
                  The $500
                  <br />
                  stream rig.
                </p>
              </div>
            </div>
          </div>

          {/* Title + schedule line. */}
          <div className="space-y-2">
            <h3 className="text-[15px] font-semibold leading-snug text-foreground">
              The $500 stream rig — what I changed after six months
            </h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarIcon />
              <span>Saturday · 8:00 AM PT</span>
              <span aria-hidden>·</span>
              <span>Going live in 2d 14h</span>
            </div>
          </div>

          {/* Chapters strip. */}
          <div className="rounded-md border border-border/60 bg-background/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="eyebrow">Chapters · 8</span>
              <span className="font-mono text-[10px] text-status-ready">
                ✓ auto-generated
              </span>
            </div>
            <ul className="space-y-1.5 font-mono text-[11px]">
              <ChapterRow time="0:00" label="Why I changed everything" />
              <ChapterRow time="1:42" label="The camera that started it" />
              <ChapterRow time="4:30" label="Audio, finally (good lav)" />
              <ChapterRow time="8:05" label="What I'd skip next time" />
            </ul>
          </div>

          {/* Actions — primary schedule + ghost. */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              className="inline-flex h-8 flex-1 items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              Confirm schedule
              <span aria-hidden>→</span>
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-transparent px-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Edit
            </button>
          </div>
        </div>
      </div>

      {/* Floating badge — enhances the "ambient product" feel. */}
      <div
        aria-hidden="true"
        className="absolute -left-6 -bottom-4 hidden items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1.5 text-[11px] font-medium text-foreground shadow-lg backdrop-blur-sm sm:flex"
      >
        <span className="pulse-dot relative inline-block size-1.5 rounded-full bg-status-scheduled text-status-scheduled" />
        Publishing to channel
      </div>
    </div>
  );
}

function ChapterRow({ time, label }: { time: string; label: string }) {
  return (
    <li className="flex items-center gap-3 text-foreground/85">
      <span className="shrink-0 text-muted-foreground/70">{time}</span>
      <span className="truncate">{label}</span>
    </li>
  );
}

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-3.5 text-muted-foreground/80"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="3.5" width="12" height="10.5" rx="1.5" />
      <path d="M5 1.75v3M11 1.75v3M2.5 6.5h11" />
    </svg>
  );
}
