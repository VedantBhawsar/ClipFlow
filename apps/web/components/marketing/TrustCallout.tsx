import * as React from "react";

/**
 * TrustCallout — a named product decision, given its own section.
 *
 * Why a dedicated section: PRD §10 Risk 3 explicitly names
 * synthetic-looking AI thumbnails as a creator-rejection risk. This
 * isn't a footnote — it's a deliberate product choice that deserves
 * to be stated clearly.
 *
 * The section exists to answer the unspoken question a creator
 * already has on the way to the review screen: "wait, will the
 * thumbnail look like AI slop?" The answer is the mechanism
 * itself, in two sentences.
 */
export function TrustCallout() {
  return (
    <section
      aria-labelledby="trust-headline"
      className="border-b border-[color:var(--line)] bg-[color:var(--surface)]"
    >
      <div className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 sm:py-20">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16 lg:items-center">
          {/* Left: copy. */}
          <div>
            <p className="eyebrow mb-4">On thumbnails</p>
            <h2
              id="trust-headline"
              className="text-[clamp(28px,4vw,40px)] font-medium leading-[1.1] tracking-[-0.02em] text-[color:var(--ink)]"
            >
              Real frames,{" "}
              <span className="display-serif italic">not synthetic faces.</span>
            </h2>
            <p className="mt-5 max-w-[52ch] text-base leading-relaxed text-[color:var(--ink-muted)]">
              ClipFlow extracts frames from your video and composites them with
              an AI-generated background or text treatment. The subject is
              always your actual footage — never a fully synthetic creator
              likeness.
            </p>
            <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-[color:var(--ink-muted)]">
              If you want a thumbnail that looks nothing like your video, you&apos;d
              have to upload it yourself — and your upload always wins.
            </p>
          </div>

          {/* Right: side-by-side visual that explains the mechanism.
              Left card = "fully AI" (red X). Right card = "ClipFlow"
              (green check) — the composite is real frame + AI background. */}
          <div className="grid grid-cols-2 gap-4">
            <ComparisonCard
              tone="rejected"
              label="Fully AI"
              description="Synthetic creator, fake-looking."
              ariaLabel="Rejected approach: fully AI-generated thumbnail"
            />
            <ComparisonCard
              tone="approved"
              label="ClipFlow"
              description="Real frame + AI background."
              ariaLabel="ClipFlow approach: real frame composited with AI background"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function ComparisonCard({
  tone,
  label,
  description,
  ariaLabel,
}: {
  tone: "rejected" | "approved";
  label: string;
  description: string;
  ariaLabel: string;
}) {
  return (
    <figure
      aria-label={ariaLabel}
      className="overflow-hidden rounded-xl border border-[color:var(--line)] bg-[color:var(--bg)]"
    >
      <div
        aria-hidden
        className="relative aspect-video"
        style={
          tone === "rejected"
            ? {
                background:
                  "linear-gradient(135deg, #C29A4E 0%, #8C6E4E 60%, #3A2A1F 100%)",
                filter: "saturate(0.85)",
              }
            : {
                background:
                  "linear-gradient(135deg, #E8B14A 0%, #2A5C4D 70%, #1A1B18 100%)",
              }
        }
      >
        {/* The "real frame" inside the approved card — a slight inner
            rectangle reads as the extracted still that the AI background
            is composited around. */}
        {tone === "approved" ? (
          <div className="absolute inset-3 overflow-hidden rounded-sm border border-[color:var(--surface)]/30">
            <div
              className="h-full w-full"
              style={{
                background:
                  "linear-gradient(160deg, #2A3D52 0%, #1A1B18 100%)",
              }}
            />
          </div>
        ) : null}
        <span
          className={[
            "absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em]",
            tone === "rejected"
              ? "bg-[color:var(--status-error)]/15 text-[color:var(--status-error)]"
              : "bg-[color:var(--status-ready)]/15 text-[color:var(--status-ready)]",
          ].join(" ")}
        >
          {tone === "rejected" ? "Not this" : "This"}
        </span>
      </div>
      <figcaption className="border-t border-[color:var(--line)] px-4 py-3">
        <p className="text-sm font-medium text-[color:var(--ink)]">{label}</p>
        <p className="mt-0.5 text-[12px] text-[color:var(--ink-muted)]">
          {description}
        </p>
      </figcaption>
    </figure>
  );
}