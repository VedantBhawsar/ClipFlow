"use client";

import { SidebarContent } from "@/components/dashboard/sidebar-content";

/**
 * Desktop dashboard sidebar (renders at `lg+` only).
 *
 * This is a thin shell — the actual chrome (logo, nav, channel
 * indicator, sign-out) lives in `<SidebarContent>` so the same body
 * can be reused in the mobile drawer (`<MobileNav>`).
 *
 * Mobile uses the slide-out drawer in `mobile-nav.tsx` instead, so
 * this aside is hidden below the `lg` breakpoint.
 */
export function Sidebar() {
  return (
    <aside
      aria-label="Primary navigation"
      className="hidden w-64 shrink-0 border-r border-[color:var(--line)] lg:flex lg:flex-col"
    >
      <SidebarContent />
    </aside>
  );
}