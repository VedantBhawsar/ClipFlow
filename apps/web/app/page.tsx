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
 * Centered, calm, italic-serif-on-grotesque aesthetic — sans + italic
 * display serif combination on every headline, generous whitespace,
 * the hero capped by a vertical gradient bar spectrum.
 *
 * Sections, in order:
 *   1. SiteHeader  — sans/italic wordmark + horizontal nav + dark CTA
 *   2. Hero        — avatar pill + display headline + email+button CTA + gradient bars
 *   3. FeatureTrio — three feature cards with their own product visuals
 *   4. HowItWorks  — three-step timeline
 *   5. CreatorVoice — testimonial + stat counters + handle marquee
 *   6. CtaBand     — final conversion (mirrors the hero CTA)
 *   7. SiteFooter  — three-column nav + brand block
 */
export default function LandingPage() {
  return (
    <div className="landing grain relative isolate flex min-h-svh flex-col bg-background text-foreground">
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