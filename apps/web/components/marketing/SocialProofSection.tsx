import * as React from "react";

/**
 * SocialProofSection — placeholder-safe by design.
 *
 * Why this section exists but stays empty: SaaS landing pages convert
 * better with social proof, but ClipFlow hasn't launched publicly yet.
 * Inventing testimonials, avatars, or review scores would violate the
 * product's own trust thesis (Design.md §1 — "quiet confidence over
 * excitement") and the page's acceptance criterion that no fabricated
 * social proof can appear.
 *
 * The component is structured so real testimonials slot in later
 * without a redesign: `TESTIMONIALS` is a typed const (see below).
 * Drop a real entry in, and the section renders it. Until then, the
 * section renders the "early access" framing as a fallback.
 *
 * The founder note is the one piece of copy here that is verifiable
 * today (it is the product's own statement to the reader) — it is
 * NOT presented as a quote from a third party.
 */
export interface Testimonial {
  id: string;
  quote: string;
  attribution: string;
  context: string;
}

/**
 * Empty by default. Add real entries as the product acquires them.
 * The shape is locked in now so the rendering code doesn't need to
 * change when the first real entry lands.
 */
export const TESTIMONIALS: ReadonlyArray<Testimonial> = [];

export function SocialProofSection() {
  return (
    <section
      aria-labelledby="social-proof-headline"
      className="border-b border-[color:var(--line)] bg-[color:var(--surface)]"
    >
      <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-24">
        <div className="mx-auto mb-10 max-w-[40rem] text-center">
          <p className="eyebrow mb-4">Where we are</p>
          <h2
            id="social-proof-headline"
            className="text-[clamp(28px,4vw,40px)] font-medium leading-[1.1] tracking-[-0.02em] text-[color:var(--ink)]"
          >
            Early access.{" "}
            <span className="display-serif italic">By design.</span>
          </h2>
        </div>

        {TESTIMONIALS.length > 0 ? (
          <TestimonialGrid />
        ) : (
          <EarlyAccessNote />
        )}
      </div>
    </section>
  );
}

/**
 * The placeholder-safe fallback: a single founder note framed as the
 * product's own statement. No fake avatars, no invented names, no
 * star ratings, no "2.4M videos published"-style invented stats.
 */
function EarlyAccessNote() {
  return (
    <div className="mx-auto max-w-[44rem] rounded-2xl border border-[color:var(--line)] bg-[color:var(--bg)] p-8 sm:p-10">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-muted)]">
        A note from us
      </p>
      <p className="mt-4 text-[17px] leading-relaxed text-[color:var(--ink)]">
        ClipFlow is in early access. We&apos;re letting real creators use it,
        answering the support inbox ourselves, and shipping the rough edges
        before opening up. If that&apos;s the version of the product you want to
        try first, the door is open.
      </p>
      <p className="mt-5 text-sm text-[color:var(--ink-muted)]">
        Testimonials from early-access users will land here as they come in —
        we won&apos;t put words in anyone&apos;s mouth.
      </p>
    </div>
  );
}

function TestimonialGrid() {
  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {TESTIMONIALS.map((t) => (
        <li
          key={t.id}
          className="rounded-xl border border-[color:var(--line)] bg-[color:var(--bg)] p-6"
        >
          <blockquote className="text-[15px] leading-relaxed text-[color:var(--ink)]">
            {t.quote}
          </blockquote>
          <figcaption className="mt-5 border-t border-[color:var(--line)] pt-4 text-sm">
            <p className="font-medium text-[color:var(--ink)]">
              {t.attribution}
            </p>
            <p className="mt-0.5 text-[13px] text-[color:var(--ink-muted)]">
              {t.context}
            </p>
          </figcaption>
        </li>
      ))}
    </ul>
  );
}