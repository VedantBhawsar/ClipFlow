import Link from "next/link";

import { Logo } from "@/components/shared/logo";

/**
 * Marketing footer — three nav columns + brand block + bottom line.
 *
 * Bottom line includes a bottom safe-area padding so the Next.js dev
 * indicator (bottom-left in dev mode) never overlaps footer content when
 * screenshots are captured.
 */
export function SiteFooter() {
  const cols = [
    {
      title: "Product",
      links: [
        { href: "/#features", label: "Features" },
        { href: "/#how", label: "How it works" },
        { href: "/#pricing", label: "Pricing" },
        { href: "/signin", label: "Sign in" },
      ],
    },
    {
      title: "Resources",
      links: [
        { href: "/changelog", label: "Changelog" },
        { href: "/blog", label: "Field notes" },
        { href: "/help", label: "Help center" },
        { href: "/status", label: "Status" },
      ],
    },
    {
      title: "Company",
      links: [
        { href: "/about", label: "About" },
        { href: "/legal/privacy", label: "Privacy" },
        { href: "/legal/terms", label: "Terms" },
        { href: "mailto:hello@clipflow.app", label: "Contact" },
      ],
    },
  ];

  return (
    <footer className="relative border-t border-border/60">
      <div className="mx-auto max-w-[1180px] px-6 py-16 sm:px-10">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))] sm:gap-12">
          <div className="col-span-2 sm:col-span-1">
            <Logo />
            <p className="mt-4 max-w-[36ch] text-sm leading-relaxed text-muted-foreground">
              The three most repetitive parts of publishing a YouTube video,
              done for you in one pass.
            </p>
          </div>

          {cols.map((col) => (
            <div key={col.title}>
              <h4 className="eyebrow mb-4">{col.title}</h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-3 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <span>© {new Date().getFullYear()} ClipFlow</span>
          <span>Built for YouTube creators who&apos;d rather be creating.</span>
        </div>
      </div>

      {/* Reserves a strip of space at the bottom on mobile so the Next.js
          dev indicator (fixed bottom-left) never overlaps our content
          when this page is screenshotted in development. */}
      <div className="h-12 sm:h-0" aria-hidden="true" />
    </footer>
  );
}
