"use client";

import { motion } from "motion/react";

import { Button } from "@/components/ui/button";

/**
 * Hero — centered single-column composition that fits a single viewport.
 *
 * Visual hierarchy:
 *   1. Avatar-stack pill (social proof above the fold)
 *   2. Display headline: "Schedule. Thumbnail. Ship." in grotesque,
 *      followed by "Without the Sunday night." in italic display serif.
 *   3. Two-line soft-grey subhead
 *   4. Combined email + button CTA (the waitlist form)
 *   5. Vertical gradient bar spectrum filling the bottom of the viewport
 *
 * Layout: the section is `h-screen` (a single viewport tall). The copy
 * column sits at the top; the gradient bars claim the remaining vertical
 * space via flex-1 — the spectrum grows with viewport height rather than
 * being a fixed pixel value, which keeps the composition balanced on
 * both 13" laptops and 32" monitors.
 *
 * No product card on the right side of this hero — the centered
 * composition and the gradient bar treatment do the visual work.
 */
export function Hero() {
  return (
    <section
      className="relative isolate flex h-screen min-h-[760px] flex-col overflow-hidden"
      aria-labelledby="hero-headline"
    >
      <div className="relative z-10 mx-auto flex w-full max-w-[1240px] flex-1 flex-col items-center justify-between px-6 pt-10 pb-0 text-center sm:px-10 sm:pt-14">
        {/* Avatar + count pill */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="inline-flex items-center gap-2.5 rounded-full border border-border bg-card/80 px-2 py-1.5 shadow-sm backdrop-blur-sm"
        >
          <AvatarStack />
          <span className="font-mono text-[11px] text-foreground/80">
            3.1K creators already shipping with ClipFlow
          </span>
        </motion.div>

        {/* Display headline. The first line is grotesque; the second line
            is italic display serif — same Instrument Serif as the section
            headings further down, so the eye carries the same voice. */}
        <motion.h1
          id="hero-headline"
          className="mt-8 max-w-[14ch] text-[clamp(48px,8vw,108px)] font-medium leading-[1.02] tracking-[-0.025em] text-foreground sm:mt-10"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.85, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <span>Schedule. </span>
          <span className="text-muted-foreground/70">Thumbnail.</span>
          <span> Ship.</span>
          <br />
          <span className="display-serif italic text-foreground">
            Without the Sunday night.
          </span>
        </motion.h1>

        {/* Subhead */}
        <motion.p
          className="mt-7 max-w-[52ch] text-base leading-relaxed text-muted-foreground sm:text-lg"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.7,
            delay: 0.25,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          Connect YouTube when you publish your first video. ClipFlow schedules
          it, generates the thumbnail, and writes the chapter timestamps —
          automatically.
        </motion.p>

        {/* Email + button CTA */}
        <motion.form
          className="mt-6 flex w-full max-w-[480px] items-center gap-1 rounded-full border border-border bg-card p-1.5 shadow-sm"
          onSubmit={(e) => e.preventDefault()}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <label htmlFor="hero-email" className="sr-only">
            Email address
          </label>
          <input
            id="hero-email"
            type="email"
            placeholder="you@youtube.com"
            className="flex-1 bg-transparent px-4 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
          />
          <Button
            type="submit"
            size="default"
            className="h-10 rounded-full px-5"
          >
            Start free →
          </Button>
        </motion.form>

        {/* Trust line — sits below the CTA, centered, mono-styled. */}
        <motion.p
          className="mt-5 flex items-center justify-center gap-2 font-mono text-[11px] text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55, duration: 0.6 }}
        >
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
        </motion.p>

        {/* Bottom: vertical gradient bars — flex-1 so they claim the
            remaining vertical space below the copy column. */}
        <div className="flex w-full flex-1 items-end pt-8">
          <GradientBars />
        </div>
      </div>
    </section>
  );
}

/**
 * AvatarStack — three small overlapping circular avatars.
 * Pure CSS gradients; no external image dependencies.
 */
function AvatarStack() {
  return (
    <div className="flex -space-x-1.5">
      {[
        "linear-gradient(135deg, #F5C466, #C29A4E)",
        "linear-gradient(135deg, #4A8770, #1F3D33)",
        "linear-gradient(135deg, #5A7C9E, #2A3D52)",
      ].map((bg, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="inline-block size-6 rounded-full border-2 border-card"
          style={{ background: bg }}
        />
      ))}
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

/**
 * GradientBars — the row of vertical gradient bars at the bottom of
 * the hero. Each bar is its own column; the gradient on each column
 * fades from a saturated color near the top to a desaturated/warm-white
 * tone near the bottom, with a soft top-to-bottom gradient.
 *
 * The bars are staggered via Motion: each one carries a 4–6s y-breathe
 * animation with a randomized delay, so the row feels alive without
 * drawing attention. Reduced-motion users see the bars static.
 *
 * The middle of the row uses very pale gradients to read as a soft
 * white "valley" between the lime-green and teal ends — the spectrum
 * compresses in the center.
 */
function GradientBars() {
  // Bars are described as: (color-top → color-bottom, intensity 0–1).
  // The gradient is rendered with `color-mix` so the brightness is
  // dialed in via inline style — keeps the JSX compact.
  const bars: { left: number; top: string; bottom: string; height: number }[] =
    [
      { left: 0, top: "#D4F56B", bottom: "#FAFAF8", height: 0.92 },
      { left: 1, top: "#BFE879", bottom: "#FAFAF8", height: 0.88 },
      { left: 2, top: "#A8DB85", bottom: "#FAFAF8", height: 0.84 },
      { left: 3, top: "#8FCB91", bottom: "#FAFAF8", height: 0.8 },
      { left: 4, top: "#7BBA9C", bottom: "#FAFAF8", height: 0.74 },
      { left: 5, top: "#6BAA9F", bottom: "#FAFAF8", height: 0.66 },
      { left: 6, top: "#5F9CA0", bottom: "#FAFAF8", height: 0.58 },
      { left: 7, top: "#5C909D", bottom: "#FAFAF8", height: 0.52 },
      { left: 8, top: "#5A859A", bottom: "#FAFAF8", height: 0.5 },
      { left: 9, top: "#4F8694", bottom: "#FAFAF8", height: 0.54 },
      { left: 10, top: "#3E868C", bottom: "#FAFAF8", height: 0.6 },
      { left: 11, top: "#2E8584", bottom: "#FAFAF8", height: 0.66 },
      { left: 12, top: "#22837A", bottom: "#FAFAF8", height: 0.74 },
      { left: 13, top: "#1D8072", bottom: "#FAFAF8", height: 0.82 },
      { left: 14, top: "#1F7C68", bottom: "#FAFAF8", height: 0.88 },
      { left: 15, top: "#237A60", bottom: "#FAFAF8", height: 0.94 },
      { left: 16, top: "#2C7C5C", bottom: "#FAFAF8", height: 0.98 },
      { left: 17, top: "#357F58", bottom: "#FAFAF8", height: 1.0 },
      { left: 18, top: "#3F8255", bottom: "#FAFAF8", height: 0.98 },
      { left: 19, top: "#4A8553", bottom: "#FAFAF8", height: 0.92 },
    ];

  return (
    <div
      aria-hidden="true"
      className="relative h-full min-h-[260px] w-full overflow-hidden"
    >
      {/* Subtle vertical fade at the top so the bars meet the white page
          background rather than ending in a hard line. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20"
        style={{
          background:
            "linear-gradient(to bottom, var(--color-background), transparent)",
        }}
      />

      <div className="absolute inset-x-0 bottom-0 flex w-full items-end justify-center gap-[6px] px-2">
        {bars.map((bar, i) => {
          const delay = (i % 7) * 0.4;
          return (
            <motion.span
              key={i}
              className="block w-[5%] rounded-t-[6px] sm:w-[3.5%]"
              style={{
                height: `${bar.height * 100}%`,
                background: `linear-gradient(to bottom, ${bar.top} 0%, ${bar.bottom} 100%)`,
              }}
              initial={{ y: 0 }}
              animate={{ y: [0, -4, 0] }}
              transition={{
                duration: 5 + (i % 3),
                delay,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
