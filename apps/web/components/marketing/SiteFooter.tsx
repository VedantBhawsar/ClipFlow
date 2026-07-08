import Link from "next/link";

import { Logo } from "@/components/shared/logo";

/**
 * Marketing footer.
 *
 * Wayfinding only — not a conversion section. Three nav columns,
 * brand block on the left, single copyright line at the bottom. The
 * legal links point to /legal/privacy and /legal/terms; those routes
 * aren't built yet but the anchor matches the convention used
 * elsewhere on the marketing surface.
 */
export function SiteFooter() {
  const cols = [
    {
      title: "Product",
      links: [
        { href: "#features", label: "Features" },
        { href: "#how", label: "How it works" },
        { href: "#pricing", label: "Pricing" },
        { href: "#faq", label: "FAQ" },
      ],
    },
    {
      title: "Account",
      links: [
        { href: "/signin", label: "Log in" },
        { href: "/signup", label: "Create account" },
      ],
    },
    {
      title: "Legal",
      links: [
        { href: "/legal/privacy", label: "Privacy" },
        { href: "/legal/terms", label: "Terms" },
        { href: "mailto:hello@clipflow.app", label: "Contact" },
      ],
    },
  ];

  return (
    <footer className="border-t border-[color:var(--line)] bg-[color:var(--bg)]">
      <div className="mx-auto max-w-[1200px] px-5 py-14 sm:px-8 sm:py-16">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] sm:gap-12">
          <div className="col-span-2 sm:col-span-1">
            <Link
              href="/"
              aria-label="ClipFlow home"
              className="inline-flex items-center"
            >
              <Logo className="h-7 w-auto" />
            </Link>
            <p className="mt-4 max-w-[34ch] text-sm leading-relaxed text-[color:var(--ink-muted)]">
              The three most repetitive parts of publishing a YouTube video —
              scheduled, written, done.
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
                      className="text-sm text-[color:var(--ink-muted)] transition-colors hover:text-[color:var(--ink)]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-[color:var(--line)] pt-6 text-xs text-[color:var(--ink-muted)] sm:flex-row sm:items-center">
          <span>© {new Date().getFullYear()} ClipFlow</span>
          <span>Built for creators who&apos;d rather be creating.</span>
        </div>
      </div>
    </footer>
  );
}