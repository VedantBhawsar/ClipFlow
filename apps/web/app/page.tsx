import Link from "next/link";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shared/logo";

export const metadata: Metadata = {
  title: "ClipFlow — schedule, thumbnail, and chapter your YouTube videos",
  description:
    "Upload once, and ClipFlow schedules, generates thumbnails, and writes chapter timestamps — automatically.",
};

/**
 * Marketing landing.
 *
 * Per Design.md: single column, max-width 960px, restraint over flash.
 * One value-prop headline, one supporting paragraph, one primary CTA.
 * No illustrations, no gradients.
 */
export default function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <Link href="/" aria-label="ClipFlow home" className="inline-flex">
          <Logo />
        </Link>
        <nav aria-label="Account" className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/signin">Sign in</Link>
          </Button>
        </nav>
      </header>

      <main className="flex flex-1 items-center px-6 sm:px-10">
        <div className="mx-auto w-full max-w-[960px] py-16 sm:py-24">
          <div className="mx-auto max-w-[720px] space-y-6">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[28px] sm:leading-[1.25]">
              Schedule uploads, generate thumbnails, and write chapter timestamps — automatically.
            </h1>
            <p className="max-w-prose text-base text-muted-foreground">
              ClipFlow handles the three most repetitive parts of publishing a
              YouTube video. You upload once, and the rest of the workflow
              runs unattended — so you can get back to making the next one.
            </p>
            <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:gap-3">
              <Button asChild size="lg">
                <Link href="/signup">Get started</Link>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <Link href="/signin">Sign in</Link>
              </Button>
            </div>
            <p className="pt-4 text-xs text-muted-foreground">
              No credit card required to set up. Connect your YouTube channel
              when you&apos;re ready to publish your first video.
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-border px-6 py-6 sm:px-10">
        <div className="mx-auto flex max-w-[960px] flex-col items-start justify-between gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <span>ClipFlow</span>
          <span>Built for YouTube creators who&apos;d rather be creating.</span>
        </div>
      </footer>
    </div>
  );
}
