"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";

/**
 * Marketing site header.
 *
 * Three-rail centered layout: logo on the left, primary nav in the
 * middle (hidden on mobile), and a single dark CTA on the right.
 *
 * Note on the wordmark: the reference uses "Build" (sans) + "nest"
 * (italic serif). We mirror that with a small touch — "Clip" stays in
 * the existing logo's sans wordmark; we don't introduce a separate
 * mark here because the Logo SVG already carries the brand identity.
 */
export function SiteHeader() {
  const navItems = [
    { href: "/#features", label: "Product" },
    { href: "/#how", label: "How it works" },
    { href: "/#pricing", label: "Pricing" },
    { href: "/#contact", label: "Contact" },
  ];

  return (
    <motion.header
      className="relative z-20"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-6 px-6 py-5 sm:px-10">
        <Link
          href="/"
          aria-label="ClipFlow home"
          className="inline-flex items-baseline text-[22px] tracking-[-0.02em]"
        >
          <span className="font-sans font-semibold text-foreground">
            Clip
          </span>
          <span className="display-serif italic text-foreground">flow</span>
          <span className="ml-2 hidden text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground sm:inline">
            beta
          </span>
        </Link>

        <nav
          aria-label="Primary"
          className="hidden items-center gap-1 md:flex"
        >
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button
            asChild
            size="sm"
            className="rounded-full bg-foreground px-4 text-background hover:bg-foreground/90"
          >
            <Link href="/signup">Start free</Link>
          </Button>
        </div>
      </div>
    </motion.header>
  );
}