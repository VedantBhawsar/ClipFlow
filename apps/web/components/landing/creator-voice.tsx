"use client";

import * as React from "react";
import { motion, useInView, animate } from "motion/react";

/**
 * Creator voice — single centered testimonial with a quiet stats row
 * and a marquee of channel handles underneath.
 *
 * Same sans + italic-serif pattern in the section headline as the rest
 * of the page. Stat values count up on scroll-into-view via Motion
 * `animate`. The marquee is JS-driven (60fps) instead of CSS keyframes.
 */
export function CreatorVoice() {
  return (
    <section className="relative border-t border-border/60">
      <div className="mx-auto max-w-[1240px] px-6 py-24 sm:px-10 sm:py-32">
        <div className="mx-auto mb-16 max-w-[36rem] text-center">
          <p className="eyebrow mb-4">From the people using it</p>
          <h2 className="text-[clamp(36px,5vw,56px)] font-medium leading-[1.05] tracking-[-0.02em] text-foreground">
            Loved by creators{" "}
            <span className="display-serif italic">who&apos;d rather be creating.</span>
          </h2>
        </div>

        <Quote />

        <StatsRow />

        <ChannelMarquee />
      </div>
    </section>
  );
}

function Quote() {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15% 0px" });

  return (
    <motion.figure
      ref={ref}
      className="mx-auto max-w-[44rem] text-center"
      initial={{ opacity: 0, y: 22 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      <blockquote className="display-serif text-[clamp(24px,3.2vw,40px)] leading-[1.18] text-foreground">
        <span aria-hidden className="text-foreground/40">
          &ldquo;
        </span>
        I used to lose every Sunday evening to scheduling, thumbnailing, and
        writing chapters. Now I render on Saturday and{" "}
        <span className="italic">forget about it</span> until it&apos;s live.
        <span aria-hidden className="text-foreground/40">
          &rdquo;
        </span>
      </blockquote>
      <figcaption className="mt-8 inline-flex items-center gap-3">
        <div
          aria-hidden="true"
          className="size-10 rounded-full"
          style={{
            background:
              "conic-gradient(from 220deg, #F5C466, #4A8770, #5A7C9E, #F5C466)",
          }}
        />
        <div className="text-left text-sm">
          <div className="font-medium text-foreground">Maren K.</div>
          <div className="font-mono text-xs text-muted-foreground">
            142k subs · Reviews &amp; teardowns channel
          </div>
        </div>
      </figcaption>
    </motion.figure>
  );
}

function StatsRow() {
  return (
    <div className="mx-auto mt-20 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
      <Stat label="Videos published" value="2.4M" />
      <Stat label="Chapter accuracy" value="97%" />
      <Stat label="Hrs saved / week" value="6.2" />
      <Stat label="Channels shipped" value="4,200+" />
    </div>
  );
}

/**
 * Stat with a counter animation — the value tweens from 0 to its target
 * when scrolled into view.
 */
function Stat({ value, label }: { value: string; label: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const [display, setDisplay] = React.useState<string>(extractInitial(value));

  React.useEffect(() => {
    if (!inView) return;
    const numeric = parseFloat(value.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(numeric)) {
      setDisplay(value);
      return;
    }
    const suffix = value.replace(/[0-9.,]/g, "");
    const controls = animate(0, numeric, {
      duration: 1.4,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        const dotIdx = value.indexOf(".");
        const decimals = dotIdx >= 0 ? value.length - dotIdx - 1 : 0;
        const formatted =
          decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString();
        setDisplay(`${formatted}${suffix}`);
      },
    });
    return () => controls.stop();
  }, [inView, value]);

  return (
    <div ref={ref} className="bg-card p-6 text-center">
      <div className="display-serif text-3xl text-foreground sm:text-4xl">
        {display}
      </div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function extractInitial(value: string): string {
  return value.replace(/[0-9]/g, "0");
}

/**
 * Marquee — duplicated handle list scrolls left at 38s per loop, JS-driven
 * via motion `animate`.
 */
function ChannelMarquee() {
  const HANDLES = [
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
  ];
  const row = [...HANDLES, ...HANDLES];
  const x = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = x.current;
    if (!el) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      el.style.transform = "translateX(0)";
      return;
    }

    const distance = el.scrollWidth / 2;
    const controls = animate(0, -distance, {
      duration: 38,
      ease: "linear",
      repeat: Infinity,
      onUpdate: (v) => {
        el.style.transform = `translateX(${v}px)`;
      },
    });
    return () => controls.stop();
  }, []);

  return (
    <div className="relative mt-20 overflow-hidden border-y border-border/60 py-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-32 bg-gradient-to-r from-background to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-32 bg-gradient-to-l from-background to-transparent"
      />
      <div
        ref={x}
        className="flex w-max gap-12 whitespace-nowrap will-change-transform"
      >
        {row.map((handle, i) => (
          <span
            key={`${handle}-${i}`}
            className="font-mono text-sm text-muted-foreground/70"
          >
            {handle}
          </span>
        ))}
      </div>
    </div>
  );
}