"use client";

import * as React from "react";

import { FAQ_ENTRIES, type FaqEntry } from "@/lib/marketing/faq";

/**
 * FaqSection — the small objections a creator still has at the bottom
 * of the page, answered plainly.
 *
 * Source-of-truth: `lib/marketing/faq.ts`. The component is a thin
 * accordion over the typed `FAQ_ENTRIES` array; questions and answers
 * stay in the data file so copy is reviewable in one place and the
 * section doesn't need to be re-edited to add a new entry.
 *
 * The accordion is a controlled list of open ids (a `Set`), not a
 * single open index — multiple questions can be expanded at once.
 * This matches how creators actually scan a FAQ (open several,
 * compare answers) and is also what the WAI-ARIA accordion pattern
 * recommends when the entries are independent.
 *
 * A11y: each trigger is a real `<button>` with `aria-expanded` and
 * `aria-controls`; the panel has the matching `id` and `role="region"`.
 * Keyboard users get the native button focus + Space/Enter toggle.
 */
export function FaqSection() {
  const [openIds, setOpenIds] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const toggle = React.useCallback((id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return (
    <section
      id="faq"
      aria-labelledby="faq-headline"
      className="border-b border-[color:var(--line)] bg-[color:var(--bg)]"
    >
      <div className="mx-auto max-w-[860px] px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto mb-12 max-w-[40rem] text-center">
          <p className="eyebrow mb-4">Questions</p>
          <h2
            id="faq-headline"
            className="text-[clamp(32px,4.5vw,48px)] font-medium leading-[1.05] tracking-[-0.02em] text-[color:var(--ink)]"
          >
            Honest answers,{" "}
            <span className="display-serif italic">before you commit.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-[46ch] text-base leading-relaxed text-[color:var(--ink-muted)]">
            The questions a creator actually has on the way to checkout. If
            yours isn&apos;t here, ask us — the inbox is read by a human.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)]">
          {FAQ_ENTRIES.map((entry, i) => (
            <FaqRow
              key={entry.id}
              entry={entry}
              isOpen={openIds.has(entry.id)}
              onToggle={() => toggle(entry.id)}
              isLast={i === FAQ_ENTRIES.length - 1}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqRow({
  entry,
  isOpen,
  onToggle,
  isLast,
}: {
  entry: FaqEntry;
  isOpen: boolean;
  onToggle: () => void;
  isLast: boolean;
}) {
  const panelId = `faq-panel-${entry.id}`;
  const triggerId = `faq-trigger-${entry.id}`;

  return (
    <div
      className={isLast ? "" : "border-b border-[color:var(--line)]"}
    >
      {/* h3 wraps the trigger so the button stays accessible to
          assistive tech, and the question is announced as a heading. */}
      <h3 className="m-0 text-base font-medium">
        <button
          id={triggerId}
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={onToggle}
          className="group flex w-full items-center justify-between gap-6 px-5 py-5 text-left transition-colors hover:bg-[color:var(--bg)] focus-visible:bg-[color:var(--bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface)] sm:px-6"
        >
          <span className="text-[15px] font-medium text-[color:var(--ink)] sm:text-base">
            {entry.question}
          </span>
          {/* Plus/minus glyph — pure CSS, no icon library. The
              vertical bar fades out on open, leaving the horizontal
              bar (minus). Animated by opacity, not transform, so it
              doesn't fight the layout. */}
          <span
            aria-hidden
            className="relative inline-block size-4 shrink-0"
          >
            <span className="absolute left-1/2 top-1/2 block h-px w-4 -translate-x-1/2 -translate-y-1/2 bg-[color:var(--ink)]" />
            <span
              className={[
                "absolute left-1/2 top-1/2 block h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-[color:var(--ink)] transition-opacity duration-200",
                isOpen ? "opacity-0" : "opacity-100",
              ].join(" ")}
            />
          </span>
        </button>
      </h3>

      <div
        id={panelId}
        role="region"
        aria-labelledby={triggerId}
        hidden={!isOpen}
        className="px-5 pb-5 text-[15px] leading-relaxed text-[color:var(--ink-muted)] sm:px-6"
      >
        {entry.answer}
      </div>
    </div>
  );
}