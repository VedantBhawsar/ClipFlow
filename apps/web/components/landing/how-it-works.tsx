import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * How it works — three numbered steps rendered as a horizontal timeline.
 *
 * Numbers in display serif, big and quiet; no icons. The rules:
 *   1. Upload your final video
 *   2. Review what ClipFlow generated (schedule, thumbnail, chapters)
 *   3. Confirm — ClipFlow publishes at the slot
 */
export function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Upload once.",
      body: "Drag the final render in. ClipFlow transcribes it locally — nothing leaves your machine until you say so.",
    },
    {
      n: "02",
      title: "Review what's generated.",
      body: "Three thumbnail variants. A draft chapter list. A proposed schedule. Edit any of them inline — keep, change, or write your own.",
    },
    {
      n: "03",
      title: "Confirm. We're done.",
      body: "Hit confirm. ClipFlow publishes at the slot, fills the description, and posts the thumbnail. You go make the next one.",
    },
  ];

  return (
    <section id="how" className="relative border-t border-border/60 bg-background/40">
      <div className="mx-auto max-w-[1180px] px-6 py-24 sm:px-10 sm:py-32">
        <div className="mb-16 flex flex-col gap-3">
          <p className="eyebrow">How it works</p>
          <h2 className="display-serif max-w-[22ch] text-4xl text-foreground sm:text-5xl">
            From finished render <span className="italic text-primary">to live</span> in three steps.
          </h2>
        </div>

        <ol className="grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-6">
          {steps.map((step, i) => (
            <li key={step.n} className="relative">
              {/* Connector hairline — only between steps on desktop. */}
              {i < steps.length - 1 ? (
                <div
                  aria-hidden="true"
                  className="absolute left-0 right-0 top-7 hidden h-px md:block md:left-auto md:right-[-33%] md:w-[66%]"
                  style={{
                    background:
                      "linear-gradient(to right, var(--color-border), transparent)",
                  }}
                />
              ) : null}

              <span className="display-serif block text-7xl text-primary/70 sm:text-8xl">
                {step.n}
              </span>
              <h3 className="display-serif mt-3 text-2xl text-foreground sm:text-3xl">
                {step.title}
              </h3>
              <p className="mt-3 max-w-[36ch] text-sm leading-relaxed text-muted-foreground sm:text-base">
                {step.body}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-16 flex flex-col items-start gap-4 border-t border-border/60 pt-10 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-[42ch] text-sm text-muted-foreground">
            Total time from upload to scheduled: under two minutes for a typical
            10-minute video. The work afterward is ClipFlow&apos;s.
          </p>
          <Button asChild variant="outline" size="lg">
            <Link href="/signup">Try it with one video</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
