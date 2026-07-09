/**
 * Pricing config — the single source of truth for the marketing
 * page's tier copy and order.
 *
 * Mapped 1:1 to Plan rows; see /api/billing/plans.
 *
 * Why this lives in `lib/` rather than next to the section component:
 * the same config is meant to be consumed by the in-app billing screen
 * later (PRD §11 — "pricing as a one-object addition later, not a
 * redesign"), so we want that visible to non-marketing code paths too.
 *
 * Figures match PRD §8 exactly:
 *   Starter  $15  /mo —  5 videos,  3 thumbnails/video
 *   Creator  $35  /mo — 15 videos,  5 thumbnails/video
 *   Pro      $69  /mo — 40 videos, 10 thumbnails/video
 *   Chapters are included, unlimited per video, on every paid tier.
 */
export type PricingPlanId = "starter" | "creator" | "pro";

export interface PricingPlan {
  /** Stable id; references the underlying billing record (Plan.key in the DB). */
  id: PricingPlanId;
  /** Tier name, used as the card heading. */
  name: string;
  /** One-line positioning line under the name (kept short, max ~6 words). */
  tagline: string;
  /** Monthly price in USD. Rendered in the mono token for scan precision. */
  priceUsd: number;
  /** Videos per month. Rendered in the mono token. */
  videosPerMonth: number;
  /** Thumbnail candidates per video. Rendered in the mono token. */
  thumbnailsPerVideo: number;
  /** Features shown as bullets under the headline figure row. */
  features: string[];
  /** Label on the plan's CTA button. */
  ctaLabel: string;
  /** Where the CTA links. The signup entry point is `/signup`. */
  ctaHref: string;
  /**
   * If true, the card visually emphasises itself (current default or
   * recommended tier). At most one plan should set this.
   */
  highlighted?: boolean;
}

export const PRICING_PLANS: ReadonlyArray<PricingPlan> = [
  {
    id: "starter",
    name: "Starter",
    tagline: "Solo creators, posting weekly.",
    priceUsd: 15,
    videosPerMonth: 5,
    thumbnailsPerVideo: 3,
    features: [
      "Chapters — unlimited per video",
      "3 thumbnail candidates per video",
      "Direct scheduling to YouTube",
      "Reconnect-prompt safety net",
    ],
    ctaLabel: "Start free",
    ctaHref: "/signup",
  },
  {
    id: "creator",
    name: "Creator",
    tagline: "For a consistent weekly cadence.",
    priceUsd: 35,
    videosPerMonth: 15,
    thumbnailsPerVideo: 5,
    features: [
      "Chapters — unlimited per video",
      "5 thumbnail candidates per video",
      "Direct scheduling to YouTube",
      "Reconnect-prompt safety net",
      "Priority processing queue",
    ],
    ctaLabel: "Start free",
    ctaHref: "/signup",
    highlighted: true,
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For high-output channels.",
    priceUsd: 69,
    videosPerMonth: 40,
    thumbnailsPerVideo: 10,
    features: [
      "Chapters — unlimited per video",
      "10 thumbnail candidates per video",
      "Direct scheduling to YouTube",
      "Reconnect-prompt safety net",
      "Priority processing queue",
      "Dedicated support channel",
    ],
    ctaLabel: "Start free",
    ctaHref: "/signup",
  },
];

/**
 * Pricing-side disclosures that belong near the tier cards. Pulled out
 * of JSX so they read as data and can be unit-tested.
 */
export const CHECKOUT_HREFS: Record<PricingPlanId, string> = {
  starter: "/billing?plan=starter",
  creator: "/billing?plan=creator",
  pro: "/billing?plan=pro",
};

export const PRICING_FOOTNOTES: ReadonlyArray<string> = [
  "Chapters are included, unlimited, on every paid tier.",
  "Cancel anytime from your dashboard. No annual commitment.",
  "One YouTube channel per account (multi-channel is a v2 deliverable).",
];