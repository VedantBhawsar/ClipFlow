"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useInView } from "motion/react";

import { Button } from "@/components/ui/button";

/**
 * How it works — three numbered steps rendered as a horizontal timeline.
 *
 * Calm, centered section title with the sans + italic-serif pattern.
 * Below, three columns: number, sans-serif title (with an italic display
 * serif tail), body. A thin hairline divider runs across all three.
 */
export function HowItWorks() {
  const ref = React.useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15% 0px" });

  const steps = [
    {
      n: "01",
      title: "Upload once.",
      italic: "We watch the rest.",
      body: "Drag the final render in. ClipFlow transcribes it locally — nothing leaves your machine until you say so.",
    },
    {
      n: "02",
      title: "Review what's generated.",
      italic: "Edit anything.",
      body: "Three thumbnail variants. A draft chapter list. A proposed schedule. Edit any of them inline — keep, change, or write your own.",
    },
    {
      n: "03",
      title: "Confirm.",
      italic: "We're done.",
      body: "Hit confirm. ClipFlow publishes at the slot, fills the description, and posts the thumbnail. You go make the next one.",
    },
  ];

  return (
    <section
      id="how"
      ref={ref}
      className="relative border-t border-border/60 bg-background/40"
    >
      <div className="mx-auto max-w-[1240px] px-6 py-24 sm:px-10 sm:py-32">
        <div className="mx-auto mb-16 max-w-[40rem] text-center">
          <p className="eyebrow mb-4">How it works</p>
          <h2 className="text-[clamp(36px,5vw,56px)] font-medium leading-[1.05] tracking-[-0.02em] text-foreground">
            From finished render{" "}
            <span className="display-serif italic">to live</span> in three
            steps.
          </h2>
        </div>

        <ol className="relative grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-8">
          {steps.map((step, i) => (
            <motion.li
              key={step.n}
              className="relative"
              initial={{ opacity: 0, y: 22 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{
                duration: 0.7,
                delay: 0.15 + i * 0.12,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <span className="display-serif block text-7xl text-primary/70 sm:text-8xl">
                {step.n}
              </span>
              <h3 className="mt-4 text-2xl font-medium tracking-[-0.01em] text-foreground sm:text-[28px]">
                {step.title}
                <br />
                <span className="display-serif italic text-foreground/70">
                  {step.italic}
                </span>
              </h3>
              <p className="mt-4 max-w-[34ch] text-sm leading-relaxed text-muted-foreground sm:text-base">
                {step.body}
              </p>
            </motion.li>
          ))}
        </ol>

        <div className="mt-16 flex flex-col items-center gap-4 border-t border-border/60 pt-10 sm:flex-row sm:justify-between">
          <p className="max-w-[42ch] text-sm text-muted-foreground sm:text-left">
            Total time from upload to scheduled: under two minutes for a
            typical 10-minute video. The work afterward is ClipFlow&apos;s.
          </p>
          <Button asChild variant="outline" size="default" className="rounded-full px-5">
            <Link href="/signup">Try it with one video</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}