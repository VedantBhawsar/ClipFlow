import Link from "next/link";

import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";

/**
 * Marketing site header.
 *
 * Three-rail layout (logo | nav | account). Center nav links are hidden on
 * mobile — they're tertiary and a sign-in / start-free pair carries the
 * page's full conversion weight on small screens.
 */
export function SiteHeader() {
  const navItems = [
    { href: "/#features", label: "Features" },
    { href: "/#how", label: "How it works" },
    { href: "/#pricing", label: "Pricing" },
  ];

  return (
    <header className="relative z-20">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-6 px-6 py-5 sm:px-10">
        <Link
          href="/"
          aria-label="ClipFlow home"
          className="inline-flex items-center"
        >
          <Logo />
        </Link>

        <nav
          aria-label="Primary"
          className="hidden items-center gap-1 md:flex"
        >
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/signin">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Start free</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
