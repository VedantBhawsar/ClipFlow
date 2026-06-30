import type { Metadata } from "next";

import { CtaBand } from "@/components/landing/cta-band";
import { CreatorVoice } from "@/components/landing/creator-voice";
import { FeatureTrio } from "@/components/landing/feature-trio";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";

export const metadata: Metadata = {
  title: "ClipFlow — schedule, thumbnail, and chapter your YouTube videos",
  description:
    "Three things every YouTube video needs before it can go live. ClipFlow does them for you in one pass — so you can get back to the part of YouTube you actually enjoy.",
};

/**
 * Marketing landing.
 *
 * Editorial-premium aesthetic — Fraunces display serif over Inter Tight
 * body. Asymmetric hero: a real product card (not a screenshot, not an
 * illustration) as the visual anchor; a quiet gradient orb drifting
 * behind it; a hairline grain on top for tactility.
 *
 * Sections, in order:
 *   1. SiteHeader         — logo + nav + sign-in/start-free
 *   2. Hero               — eyebrow + display headline + product card
 *   3. FeatureTrio        — Schedule / Thumbnail / Chapters
 *   4. HowItWorks         — three-step timeline
 *   5. CreatorVoice       — testimonial + stats + handle marquee
 *   6. CtaBand            — final conversion card
 *   7. SiteFooter         — three-column nav + brand block
 */
export default function LandingPage() {
  return (
    <div className="landing grain relative isolate flex min-h-svh flex-col bg-background text-foreground">
      {/* Ambient orb — large radial gradient behind the hero. CSS handles
          the drift; nothing here needs JS. */}
      <div className="landing-orb absolute inset-0 -z-10" aria-hidden="true" />

      <SiteHeader />

      <main className="flex-1">
        <Hero />
        <FeatureTrio />
        <HowItWorks />
        <CreatorVoice />
        <CtaBand />
      </main>

      <SiteFooter />
    </div>
  );
}
