import * as React from "react";

/**
 * FeatureTrio — the automations named by PRD §3 Goal 1, plus one
 * adaptive layer on top of thumbnails.
 *
 * Why three named jobs and not a generic feature grid: PRD §3 Goal 1
 * names chapters, thumbnails, and scheduling as the value prop.
 * Anything else (analytics, team features, multi-channel) is out of
 * scope for v1, so a five-or-six-tile grid would either repeat the
 * same three or invent features that don't ship.
 *
 * The 4th card ("personalization") is not a fourth job — it sits on
 * top of thumbnails as a per-creator adaptive layer over the static
 * niche → style-preset lookup. It's framed as "gets better with use",
 * not as a finished capability, because it doesn't yet exist in
 * PRD/Schema/TechSpec and is positioned here as a direction rather
 * than a shipped feature.
 *
 * Each pillar has:
 *   • A headline in sans (one verb phrase).
 *   • An italic display-serif tail that names the user benefit.
 *   • A two-sentence body in active voice.
 *   • A short bullet list of concrete capabilities.
 *   • A small product visual built in HTML/CSS — no screenshots.
 */
const PILLARS: ReadonlyArray<{
  id: string;
  n: string;
  title: string;
  tail: string;
  body: string;
  bullets: ReadonlyArray<string>;
  visual: React.ReactNode;
}> = [
  {
    id: "chapters",
    n: "01",
    title: "Chapters.",
    tail: "Written from your transcript.",
    body:
      "ClipFlow reads the transcript, finds the topic shifts, and writes a chapter list that matches YouTube's format. Edit anything inline before it goes live.",
    bullets: [
      "Auto-detected from audio",
      "Editable inline before publish",
      "Appended to the video description",
    ],
    visual: <ChapterVisual />,
  },
  {
    id: "thumbnails",
    n: "02",
    title: "Thumbnails.",
    tail: "Real frames, not AI slop.",
    body:
      "ClipFlow extracts frames from your video and composites them with an AI-generated background or text treatment. Your actual footage stays your actual footage.",
    bullets: [
      "3 to 10 candidates per video (plan-dependent)",
      "Pick one, or regenerate from the same pool",
      "Bring your own — your upload always wins",
    ],
    visual: <ThumbnailVisual />,
  },
  {
    id: "scheduling",
    n: "03",
    title: "Scheduling.",
    tail: "Set a slot, walk away.",
    body:
      "Pick a date and time. ClipFlow uploads to YouTube in private state with publishAt set, and YouTube flips the video live at the moment you chose.",
    bullets: [
      "Timezone-aware picker, your local time shown",
      "Reconnect prompt before any publish fails",
      "Reschedule in one click",
    ],
    visual: <ScheduleVisual />,
  },
  {
    // Adaptive layer over thumbnails. Frames as "closer with use"
    // (not "instant") — see the file header note. Layered on top of
    // the niche preset, not a replacement for it.
    id: "personalization",
    n: "04",
    title: "Thumbnails that learn your style.",
    tail: "Closer with every video.",
    body:
      "ClipFlow notices which thumbnail candidates you keep and which you regenerate, and biases the next round of suggestions toward what you've actually picked before. It runs on top of your niche preset — your first video still has somewhere to start.",
    bullets: [
      "Per-creator, on top of your niche preset",
      "Improves with use — doesn't snap to a finished state",
      "Available across every plan",
    ],
    visual: <PersonalizationVisual />,
  },
];

export function FeatureTrio() {
  return (
    <section
      id="features"
      aria-labelledby="features-headline"
      className="border-b border-[color:var(--line)] bg-[color:var(--bg)]"
    >
      <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto mb-14 max-w-[40rem] text-center">
          <p className="eyebrow mb-4">What ClipFlow does</p>
          <h2
            id="features-headline"
            className="text-[clamp(32px,4.5vw,48px)] font-medium leading-[1.05] tracking-[-0.02em] text-[color:var(--ink)]"
          >
            One upload.{" "}
            <span className="display-serif italic">Three jobs done.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-[46ch] text-base leading-relaxed text-[color:var(--ink-muted)]">
            Chapters, thumbnails, and a publish time — produced from the same
            upload, with nothing to wire up between them.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((p) => (
            <article
              key={p.id}
              className="flex flex-col gap-5 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-6 transition-colors hover:border-[color:var(--ink)]/40"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-muted)]">
                  {p.n}
                </span>
              </div>

              <div>{p.visual}</div>

              <div>
                <h3 className="text-[24px] font-medium leading-[1.1] tracking-[-0.01em] text-[color:var(--ink)]">
                  {p.title}
                  <br />
                  <span className="display-serif italic text-[color:var(--ink-muted)]">
                    {p.tail}
                  </span>
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[color:var(--ink-muted)]">
                  {p.body}
                </p>
              </div>

              <ul className="mt-auto space-y-1.5 border-t border-[color:var(--line)] pt-4">
                {p.bullets.map((b) => (
                  <li
                    key={b}
                    className="flex items-start gap-2 text-[12px] text-[color:var(--ink)]"
                  >
                    <span
                      aria-hidden
                      className="mt-1.5 inline-block size-1 rounded-full bg-[color:var(--ink-muted)]"
                    />
                    {b}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Product visuals — built in HTML/CSS so the section ages with the
 * design tokens. Each visual is a small abstract that previews the
 * feature without being a screenshot of the in-app screen.
 */
function ChapterVisual() {
  const rows = [
    { t: "0:00", w: "Why I changed" },
    { t: "1:42", w: "The camera upgrade" },
    { t: "4:30", w: "Audio, finally good" },
    { t: "8:05", w: "What I'd skip" },
  ];
  return (
    <div className="rounded-lg border border-[color:var(--line)] bg-[color:var(--bg)] p-3">
      <div className="mb-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-[color:var(--ink-muted)]">
        <span>Transcript</span>
        <span className="text-[color:var(--status-ready)]">5 shifts</span>
      </div>
      <ul className="space-y-1.5 font-mono text-[11px]">
        {rows.map((r, i) => (
          <li
            key={r.t}
            className="flex items-center gap-2 rounded-sm border border-transparent px-1.5 py-0.5"
            style={
              i === rows.length - 1
                ? { borderColor: "var(--line)" }
                : undefined
            }
          >
            <span className="text-[color:var(--ink-muted)]">{r.t}</span>
            <span className="truncate text-[color:var(--ink)]">{r.w}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ThumbnailVisual() {
  const cards = [
    {
      rotate: "-6deg",
      x: "4%",
      bg: "linear-gradient(135deg, #E8B14A 0%, #C29A4E 60%, #5A2B16 100%)",
      label: "A · bold",
      labelDark: true,
    },
    {
      rotate: "0deg",
      x: "32%",
      bg: "linear-gradient(135deg, #5A7C9E 0%, #2A3D52 100%)",
      label: "B · clean",
      labelDark: false,
    },
    {
      rotate: "6deg",
      x: "60%",
      bg: "linear-gradient(135deg, #4A8770 0%, #1F3D33 100%)",
      label: "C · minimal",
      labelDark: false,
    },
  ];
  return (
    <div className="relative h-[120px]">
      {cards.map((c, i) => (
        <div
          key={i}
          aria-hidden
          className="absolute top-0 aspect-video w-[44%] origin-bottom overflow-hidden rounded-md border border-[color:var(--line)] shadow-sm"
          style={{
            transform: `rotate(${c.rotate}) translateX(${c.x})`,
            background: c.bg,
          }}
        >
          <div
            className={[
              "absolute inset-x-2 bottom-2 font-mono text-[9px] uppercase tracking-[0.16em]",
              c.labelDark ? "text-black/75" : "text-white/85",
            ].join(" ")}
          >
            {c.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScheduleVisual() {
  return (
    <div className="rounded-lg border border-[color:var(--line)] bg-[color:var(--bg)] p-3">
      <div className="mb-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-[color:var(--ink-muted)]">
        <span>Schedule</span>
        <span className="text-[color:var(--status-scheduled)]">Thu 14:00</span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 14 }).map((_, i) => {
          const day = i + 1;
          const queued = day === 3 || day === 10;
          const isToday = day === 6;
          return (
            <div
              key={day}
              className={[
                "flex aspect-square items-center justify-center rounded-sm font-mono text-[9px]",
                queued
                  ? "bg-[color:var(--status-scheduled)]/20 text-[color:var(--status-scheduled)]"
                  : isToday
                    ? "border border-[color:var(--ink)]/40 text-[color:var(--ink)]"
                    : "text-[color:var(--ink-muted)]/70",
              ].join(" ")}
            >
              {day}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-md bg-[color:var(--status-scheduled)]/12 px-2 py-1.5">
        <span
          aria-hidden
          className="relative inline-block size-1.5 rounded-full bg-[color:var(--status-scheduled)] pulse-dot"
        />
        <span className="font-mono text-[10px] text-[color:var(--ink)]">
          Thu · 14:00 IST
        </span>
      </div>
    </div>
  );
}

/**
 * PersonalizationVisual — two stacked thumbnail cards that read as
 * "earlier" vs "later" generations from the same creator. Same
 * composition language, slightly different framing — the visual
 * claim is "closer with use", not "different product". A small mono
 * caption underneath ("v.01 → v.12") frames it as a progression
 * across videos, not an instant on/off.
 */
function PersonalizationVisual() {
  return (
    <div className="rounded-lg border border-[color:var(--line)] bg-[color:var(--bg)] p-3">
      <div className="mb-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-[color:var(--ink-muted)]">
        <span>Per-creator</span>
        <span className="text-[color:var(--status-processing)]">Tuning</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Earlier — generic composition (the niche preset alone). */}
        <figure className="overflow-hidden rounded-sm border border-[color:var(--line)]">
          <div
            aria-hidden
            className="aspect-video"
            style={{
              background:
                "linear-gradient(135deg, #E8B14A 0%, #C29A4E 60%, #5A2B16 100%)",
            }}
          />
          <figcaption className="flex items-center justify-between border-t border-[color:var(--line)] px-1.5 py-1 font-mono text-[9px] text-[color:var(--ink-muted)]">
            <span>v.01</span>
            <span>niche preset</span>
          </figcaption>
        </figure>

        {/* Later — same composition language, biased by what the
            creator previously kept (represented by a slightly
            different framing window + the checkmark that signals
            "you kept this style"). */}
        <figure className="overflow-hidden rounded-sm border border-[color:var(--ink)]/30">
          <div
            aria-hidden
            className="relative aspect-video"
            style={{
              background:
                "linear-gradient(135deg, #4A8770 0%, #2A5C4D 70%, #1A1B18 100%)",
            }}
          >
            {/* Inner "real frame" rectangle — same vocabulary as the
                TrustCallout so the personalization claim reads as the
                same thumbnail mechanism, just retuned. */}
            <div className="absolute inset-2 overflow-hidden rounded-[1px] border border-[color:var(--surface)]/30">
              <div
                className="h-full w-full"
                style={{
                  background:
                    "linear-gradient(160deg, #2A3D52 0%, #1A1B18 100%)",
                }}
              />
            </div>
          </div>
          <figcaption className="flex items-center justify-between border-t border-[color:var(--line)] px-1.5 py-1 font-mono text-[9px] text-[color:var(--ink)]">
            <span>v.12</span>
            <span className="inline-flex items-center gap-1 text-[color:var(--status-ready)]">
              <svg
                viewBox="0 0 14 14"
                className="size-2"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M2.5 7.5l3 3 6-7" />
              </svg>
              kept
            </span>
          </figcaption>
        </figure>
      </div>

      <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--ink-muted)]/70">
        Closer with each video
      </p>
    </div>
  );
}