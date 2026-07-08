import type { Metadata } from "next";

import { DifferentiatorSection } from "@/components/marketing/DifferentiatorSection";
import { FaqSection } from "@/components/marketing/FaqSection";
import { FeatureTrio } from "@/components/marketing/FeatureTrio";
import { FinalCta } from "@/components/marketing/FinalCta";
import { Hero } from "@/components/marketing/Hero";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { PricingSection } from "@/components/marketing/PricingSection";
import { ProblemSection } from "@/components/marketing/ProblemSection";
import { ReassuranceStrip } from "@/components/marketing/ReassuranceStrip";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SocialProofSection } from "@/components/marketing/SocialProofSection";
import { TrustCallout } from "@/components/marketing/TrustCallout";

export const metadata: Metadata = {
  title: "ClipFlow — chapters, thumbnails, and a publish time in one upload",
  description:
    "Three things every YouTube video needs before it can go live. ClipFlow does them for you in one pass — so you can get back to the part of YouTube you actually enjoy.",
};

/**
 * Marketing landing.
 *
 * Sections, in source order (matches the visual order on the page):
 *   1.  SiteHeader          — sticky nav, anchor links, primary CTA
 *   2.  Hero                — outcome + dual CTA + status-timeline strip
 *   3.  ReassuranceStrip    — four honest reassurances under the hero
 *   4.  ProblemSection      — the manual workflow the creator is escaping
 *   5.  HowItWorks          — the four-step pipeline (AppFlow §2–§5)
 *   6.  FeatureTrio         — three pillars (chapters, thumbnails, scheduling)
 *   7.  TrustCallout        — real frames vs synthetic faces (PRD §10 Risk 3)
 *   8.  Differentiator      — one tool vs the point-solution stack
 *   9.  SocialProofSection  — early-access framing, no fabricated testimonials
 *   10. PricingSection      — three tiers from PRD §8, Creator highlighted
 *   11. FaqSection          — accordion over `lib/marketing/faq.ts`
 *   12. FinalCta            — closing beat, one CTA, no "free" claim
 *   13. SiteFooter          — product / account / legal columns
 *
 * Section ids match the anchor targets in `SiteHeader` (features, how,
 * pricing, faq, trust, differentiator, social-proof).
 */
export default function LandingPage() {
  return (
    <div className="landing grain relative isolate flex min-h-svh flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <ReassuranceStrip />
        <ProblemSection />
        <HowItWorks />
        <FeatureTrio />
        <TrustCallout />
        <DifferentiatorSection />
        <SocialProofSection />
        <PricingSection />
        <FaqSection />
        <FinalCta />
      </main>

      <SiteFooter />
    </div>
  );
}