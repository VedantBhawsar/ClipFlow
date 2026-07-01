"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useInView } from "motion/react";

import { Button } from "@/components/ui/button";

/**
 * CTA band — repeats the hero's email+button pattern so the page's last
 * conversion question is asked with the same affordance as the first.
 *
 * Centered, single-column. Display headline uses the sans + italic-serif
 * pattern from earlier sections.
 */
export function CtaBand() {
  const ref = React.useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15% 0px" });

  return (
    <section
      id="pricing"
      ref={ref}
      className="relative border-t border-border/60"
    >
      <div className="mx-auto max-w-[1240px] px-6 py-24 sm:px-10 sm:py-32">
        <motion.div
          className="mx-auto max-w-[44rem] text-center"
          initial={{ opacity: 0, y: 22 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="eyebrow mb-4">Ready when you are</p>
          <h2 className="text-[clamp(36px,5vw,60px)] font-medium leading-[1.05] tracking-[-0.02em] text-foreground">
            Stop scheduling at 2 a.m.{" "}
            <span className="display-serif italic">
              Render on Saturday.
            </span>
          </h2>
          <p className="mx-auto mt-5 max-w-[44ch] text-base leading-relaxed text-muted-foreground">
            Free while you&apos;re early. Connect YouTube when you publish
            your first video, not before.
          </p>

          <form
            onSubmit={(e) => e.preventDefault()}
            className="mx-auto mt-9 flex w-full max-w-[480px] items-center gap-1 rounded-full border border-border bg-card p-1.5 shadow-sm"
          >
            <label htmlFor="cta-email" className="sr-only">
              Email address
            </label>
            <input
              id="cta-email"
              type="email"
              placeholder="you@youtube.com"
              className="flex-1 bg-transparent px-4 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
            />
            <Button
              type="submit"
              size="default"
              className="h-10 rounded-full bg-foreground px-5 text-background hover:bg-foreground/90"
            >
              Start free →
            </Button>
          </form>

          <p className="mt-5 font-mono text-[11px] text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/signin"
              className="text-foreground underline-offset-4 hover:underline"
            >

              Sign in
            </Link>
            .
          </p>
        </motion.div>
      </div>
    </section>
  );
}