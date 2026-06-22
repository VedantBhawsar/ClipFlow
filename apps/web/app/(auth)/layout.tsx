import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/shared/logo";

/**
 * Auth shell: no top nav, centered card. The Logo in the corner is the
 * single persistent brand cue on these pages.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex items-center px-6 py-5">
        <Link href="/" aria-label="ClipFlow home" className="inline-flex">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center sm:py-12">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
    </div>
  );
}
