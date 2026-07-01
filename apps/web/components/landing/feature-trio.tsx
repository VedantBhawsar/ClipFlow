"use client";

import * as React from "react";
import { motion, useInView } from "motion/react";

/**
 * Feature trio — Schedule / Thumbnail / Chapters.
 *
 * Each card carries the same sans + italic-serif headline pattern as
 * the hero: grotesque word + italic display tail. The visual at the
 * top is designed (CSS / SVG) — never a screenshot.
 *
 * Section headline is centered, two-line, with the italic-serif phrase
 * on the second line — matching the hero's rhythm.
 */
export function FeatureTrio() {
  const ref = React.useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15% 0px" });

  return (
    <section
      id="features"
      ref={ref}
      className="relative border-t border-border/60"
    >
      <div className="mx-auto max-w-[1240px] px-6 py-24 sm:px-10 sm:py-32">
        <div className="mx-auto mb-16 max-w-[36rem] text-center">
          <p className="eyebrow mb-4">The three things every video needs</p>
          <h2 className="text-[clamp(36px,5vw,56px)] font-medium leading-[1.05] tracking-[-0.02em] text-foreground">
            One upload.{" "}
            <span className="display-serif italic">Three jobs done.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-[44ch] text-base leading-relaxed text-muted-foreground">
            ClipFlow reads the video, watches the audio, and writes the
            rest. You approve. We publish.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FeatureCard
            number="01"
            accent="bg-status-scheduled"
            title={
              <>
                Schedule.
                <br />
                <span className="display-serif italic text-foreground/80">
                  On autopilot.
                </span>
              </>
            }
            body="Pick a slot once. ClipFlow publishes — title, description, tags, the works — at the moment your audience is most active."
            bullets={[
              "Weekly recurring slots",
              "Auto-throttled to channel limits",
              "Reschedules in one click",
            ]}
            inView={inView}
            delay={0}
          >
            <ScheduleVisual />
          </FeatureCard>

          <FeatureCard
            number="02"
            accent="bg-studio-amber"
            title={
              <>
                Thumbnail.
                <br />
                <span className="display-serif italic text-foreground/80">
                  Three on-brand takes.
                </span>
              </>
            }
            body="Three variants generated from the frame and the title — pick the one that lands. Custom upload supported."
            bullets={[
              "3 variants per video",
              "A/B holdouts for any tier",
              "Bring your own asset",
            ]}
            inView={inView}
            delay={0.12}
          >
            <ThumbnailVisual />
          </FeatureCard>

          <FeatureCard
            number="03"
            accent="bg-status-processing"
            title={
              <>
                Chapters.
                <br />
                <span className="display-serif italic text-foreground/80">
                  Written for you.
                </span>
              </>
            }
            body="ClipFlow listens for topic shifts in your transcript and writes a clean chapter list — same format YouTube uses."
            bullets={[
              "Auto-detected from audio",
              "Editable before publish",
              "Written into the description",
            ]}
            inView={inView}
            delay={0.24}
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
  inView,
  delay,
  accent,
}: {
  number: string;
  title: React.ReactNode;
  body: string;
  bullets: string[];
  children: React.ReactNode;
  inView: boolean;
  delay: number;
  accent: string;
}) {
  return (
    <motion.article
      className="group relative flex flex-col gap-6 overflow-hidden rounded-xl border border-border bg-card p-6 transition-colors hover:border-foreground/30"
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {number}
        </span>
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${accent}`} />
      </div>

      <div className="relative">{children}</div>

      <div className="mt-auto space-y-4">
        <h3 className="text-[26px] font-medium leading-[1.1] tracking-[-0.01em] text-foreground">
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
        <ul className="space-y-1.5 border-t border-border/60 pt-4">
          {bullets.map((b) => (
            <li
              key={b}
              className="flex items-start gap-2 font-mono text-[11px] text-foreground/80"
            >
              <span aria-hidden className="mt-1.5 inline-block size-1 rounded-full bg-foreground/50" />
              {b}
            </li>
          ))}
        </ul>
      </div>
    </motion.article>
  );
}

function ScheduleVisual() {
  return (
    <div className="rounded-lg border border-border/60 bg-background p-3">
      <div className="mb-2 flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
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
                  ? "bg-status-scheduled/25 text-status-scheduled"
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
      <div className="mt-3 flex items-center gap-2 rounded-md bg-status-scheduled/15 px-2 py-1.5">
        <span className="relative inline-block size-1.5 rounded-full bg-status-scheduled text-status-scheduled pulse-dot" />
        <span className="font-mono text-[10px] text-foreground/85">
          Nov 13 — 8:00 AM PT
        </span>
      </div>
    </div>
  );
}

function ThumbnailVisual() {
  return (
    <div className="relative h-[148px]">
      {[
        {
          rotate: "-8deg",
          x: "8%",
          label: "A · bold",
          bg: "linear-gradient(135deg, #F5C466, #C29A4E, #5A2B16)",
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
          className="absolute top-0 aspect-video w-[44%] origin-bottom overflow-hidden rounded-md border border-border/70 shadow-md"
          style={{
            transform: `rotate(${card.rotate}) translateX(${card.x})`,
            background: card.bg,
          }}
        >
          {i === 0 ? (
            <div className="absolute inset-x-2 bottom-2 font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-black/75">
              {card.label}
            </div>
          ) : (
            <div className="absolute inset-x-2 bottom-2 font-mono text-[9px] uppercase tracking-[0.16em] text-white/80">
              {card.label}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ChaptersVisual() {
  return (
    <div className="space-y-1.5 rounded-lg border border-border/60 bg-background p-3 font-mono text-[10px]">
      <div className="flex items-center justify-between border-b border-border/60 pb-1.5 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        <span>Transcript</span>
        <span className="text-status-ready">5 shifts</span>
      </div>
      {[
        { t: "0:00", w: "why I changed", c: "bg-status-processing/30 text-status-processing" },
        {
          t: "1:42",
          w: "the camera upgrade",
          c: "bg-status-scheduled/30 text-status-scheduled",
        },
        {
          t: "4:30",
          w: "audio, finally good",
          c: "bg-status-scheduled/30 text-status-scheduled",
        },
        { t: "8:05", w: "what I'd skip", c: "bg-status-processing/30 text-status-processing" },
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