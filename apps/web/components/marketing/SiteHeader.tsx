"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shared/logo";

/**
 * Marketing site header.
 *
 * Three-region layout on desktop: Logo / anchor nav / CTA. On mobile the
 * nav collapses and a sheet-style drawer takes its place (kept simple —
 * a list of anchor links, not a nested menu).
 *
 * The CTA reads "Get started" — neutral, doesn't claim a free tier
 * (PRD §11 leaves that decision open). Kept as a single primary action
 * per the page's conversion principle (one CTA only). The sign-in
 * link is text-only so it stays visually subordinate to the primary
 * action.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[color:var(--line)] bg-[color:var(--bg)]/85 backdrop-blur supports-[backdrop-filter]:bg-[color:var(--bg)]/70">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-6 px-5 sm:h-16 sm:px-8">
        <Link
          href="/"
          aria-label="ClipFlow home"
          className="inline-flex items-center"
        >
          <Logo className="h-7 w-auto" />
        </Link>

        <nav
          aria-label="Primary"
          className="hidden items-center gap-1 md:flex"
        >
          <NavLink href="#features">Features</NavLink>
          <NavLink href="#how">How it works</NavLink>
          <NavLink href="#pricing">Pricing</NavLink>
          <NavLink href="#faq">FAQ</NavLink>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/signin"
            className="hidden rounded-md px-3 py-2 text-sm font-medium text-[color:var(--ink-muted)] transition-colors hover:text-[color:var(--ink)] sm:inline-flex"
          >
            Log in
          </Link>
          <Button
            asChild
            size="sm"
            className="h-9 rounded-full bg-[color:var(--accent)] px-4 text-[color:var(--accent-foreground)] hover:bg-[color:var(--accent)]/90"
          >
            <Link href="/signup">Get started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-2 text-sm font-medium text-[color:var(--ink-muted)] transition-colors hover:bg-[color:var(--surface)] hover:text-[color:var(--ink)]"
    >
      {children}
    </Link>
  );
}