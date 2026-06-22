"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Film, CreditCard, Settings, LogOut } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Show as a real link vs. a "coming soon" placeholder. */
  enabled: boolean;
}

const PRIMARY_NAV: ReadonlyArray<NavItem> = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, enabled: true },
  { href: "/videos", label: "Videos", icon: Film, enabled: false },
  { href: "/billing", label: "Billing", icon: CreditCard, enabled: false },
  // Settings lives under /dashboard/settings/* — see apps/web/app/dashboard/settings.
  { href: "/dashboard/settings", label: "Settings", icon: Settings, enabled: true },
];

interface SidebarProps {
  /** Render-time channel connection state for the footer indicator. */
  channelState?: "connected" | "unconnected";
  channelLabel?: string;
}

/**
 * Dashboard sidebar.
 *
 * Layout per Design.md:
 * - Brand at top
 * - Primary nav (Dashboard / Videos / Billing / Settings)
 * - Channel-connection indicator pinned to the footer (always visible,
 *   never dismissible)
 *
 * "Videos / Billing" routes don't exist yet in v1, so they're rendered
 * with `aria-disabled` and a tooltip — visible but not clickable.
 * Settings IS wired (Settings entry now lives under /settings/* and
 * redirects to /settings/profile on click).
 *
 * The user-email row at the bottom is now a link to /settings/profile
 * so a user can reach their profile from anywhere in the dashboard.
 */
export function Sidebar({
  channelState = "unconnected",
  channelLabel = "Channel not connected",
}: SidebarProps) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  return (
    <aside
      aria-label="Primary navigation"
      className="flex w-64 shrink-0 flex-col border-r border-border bg-card/40 h-screen"
    >
      <div className="flex h-14 items-center px-5">
        <Link href="/dashboard" aria-label="ClipFlow home" className="inline-flex">
          <Logo />
        </Link>
      </div>

      <nav className="flex-1 px-3 py-2">
        <ul className="space-y-0.5">
          {PRIMARY_NAV.map((item) => {
            const active =
              item.enabled &&
              (pathname === item.href || pathname.startsWith(`${item.href}/`));
            const Icon = item.icon;
            const className = cn(
              "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              item.enabled ? "" : "cursor-not-allowed opacity-60",
              active
                ? "bg-muted text-foreground"
                : item.enabled
                  ? "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  : "",
            );
            if (!item.enabled) {
              return (
                <li key={item.href}>
                  <span
                    aria-disabled="true"
                    title="Coming soon"
                    className={className}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {item.label}
                  </span>
                </li>
              );
            }
            return (
              <li key={item.href}>
                <Link href={item.href} className={className}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border px-3 py-3">
        <div
          className="flex items-center gap-2 rounded-md px-2 py-2 text-xs"
          aria-label="YouTube channel connection"
        >
          <span
            aria-hidden="true"
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              channelState === "connected"
                ? "bg-status-ready"
                : "bg-amber-500",
            )}
          />
          <span className="flex-1 truncate text-muted-foreground">
            {channelLabel}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-1 px-1">
          <Link
            href="/dashboard/settings/profile"
            className="flex-1 truncate rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            title="Open profile settings"
          >
            {user?.email ?? "Signed in"}
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              void signOut();
            }}
            aria-label="Sign out"
          >
            <LogOut aria-hidden="true" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
