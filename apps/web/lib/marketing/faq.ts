/**
 * FAQ entries — the section exists to pre-empt the specific objections
 * a creator would have about THIS product before they abandon at
 * checkout, not generic SaaS FAQ filler.
 *
 * Source-of-truth references (per the task spec):
 *   • Video size/length caps come from TechSpec §6 — 60 min / 5GB.
 *   • "What happens if a scheduled publish fails?" is the trust
 *     question that AppFlow §6 (reconnection flow) is designed to
 *     answer. We summarise it in one short paragraph, no jargon.
 *   • Thumbnail regeneration limits are PRD §3 / §8 — regenerations
 *     consume the same per-video pool as initial generations, never
 *     a separate allowance.
 *   • Cancellation / plan changes are AppFlow §7 — Dodo's customer
 *     portal handles them; downgrade degrades at end of cycle.
 */
export interface FaqEntry {
  /** Stable id, used as the key for the accordion trigger. */
  id: string;
  /** Short question as shown to the reader. */
  question: string;
  /** Short answer. Plain language; no AI-hype vocabulary. */
  answer: string;
}

export const FAQ_ENTRIES: ReadonlyArray<FaqEntry> = [
  {
    id: "video-limits",
    question: "How long can my videos be?",
    answer:
      "Up to 60 minutes and 5 GB per file. Both bounds are enforced before upload starts so you never burn an upload on a file the pipeline can't process.",
  },
  {
    id: "what-if-publish-fails",
    question: "What happens if a scheduled publish fails?",
    answer:
      "ClipFlow catches it before you would have noticed. The most common cause is an expired YouTube connection — your dashboard shows a clear reconnect prompt, and the scheduled video keeps its slot until you reconnect and retry. A failed publish is never silent.",
  },
  {
    id: "thumbnail-regenerations",
    question: "How many thumbnail regenerations do I get?",
    answer:
      "Regenerations draw from the same per-video pool as your initial candidates — 3, 5, or 10 depending on plan. There is no separate hidden allowance. The review screen tells you exactly how many you've used.",
  },
  {
    id: "cancellation",
    question: "What happens if I cancel?",
    answer:
      "You keep access until the end of your current billing period, then drop back to no-plan. Already-published videos on YouTube are untouched — ClipFlow only manages future publishes, never the past.",
  },
  {
    id: "plan-changes",
    question: "Can I change plans later?",
    answer:
      "Yes, both up and down. Upgrades take effect immediately; downgrades take effect at the end of your current cycle so you don't lose paid time.",
  },
  {
    id: "channel-safety",
    question: "Does ClipFlow touch my existing YouTube videos?",
    answer:
      "No. ClipFlow only acts on videos you upload to it. Your existing channel, your existing videos, your existing schedule — none of it is touched or read beyond the metadata needed to publish your ClipFlow uploads.",
  },
  {
    id: "thumbnails-look-fake",
    question: "Will the thumbnails look like AI slop?",
    answer:
      "No. ClipFlow composites real frames extracted from your video with an AI-generated background or text treatment. Your actual footage stays your actual footage — the AI fills in the design, not the subject.",
  },
];