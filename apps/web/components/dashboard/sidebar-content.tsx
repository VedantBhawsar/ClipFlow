"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Film,
  CreditCard,
  Settings,
  LogOut,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSession } from "next-auth/react";

import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSignOut } from "@/hooks/use-sign-out";
import { useYouTubeConnection } from "@/hooks/use-youtube-connection";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Show as a real link vs. a "coming soon" placeholder. */
  enabled: boolean;
}

const PRIMARY_NAV: ReadonlyArray<NavItem> = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    enabled: true,
  },
  // "Published" — the user's library of videos already on YouTube.
  // The dashboard itself shows only in-progress / not-yet-published
  // videos; this entry is the home for the live library. Routed under
  // /dashboard/published so it stays inside the dashboard shell.
  {
    href: "/dashboard/published",
    label: "Published",
    icon: Film,
    enabled: true,
  },
  { href: "/billing", label: "Billing", icon: CreditCard, enabled: false },
  // Settings lives under /dashboard/settings/* — see apps/web/app/dashboard/settings.
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: Settings,
    enabled: true,
  },
];

/**
 * Shared sidebar body. Rendered both inside the desktop <Sidebar>
 * (fixed left rail at `lg+`) and the mobile <MobileNav> (Sheet drawer
 * at `<lg`), so the chrome stays visually identical across breakpoints.
 *
 * Reads the YouTube connection directly from `useYouTubeConnection()`
 * — when a connect/disconnect mutation updates the cache, this body
 * re-renders automatically. No props threading, no manual refetch.
 *
 * `onNavigate` (optional) fires when the user picks a nav item. The
 * mobile drawer supplies a callback that closes the sheet so the
 * drawer auto-collapses on route change.
 */
export function SidebarContent({
  onNavigate,
}: {
  /** Optional callback fired on any nav-item click. Desktop doesn't
   *  pass one (nothing to close); mobile uses it to dismiss the
   *  drawer so the user sees the destination page immediately. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { data: youtubeConnectionQuery } = useYouTubeConnection();
  const youtubeConnection = youtubeConnectionQuery ?? null;
  const signOutMutation = useSignOut();

  const channelState: "connected" | "unconnected" =
    youtubeConnection?.status === "connected" ? "connected" : "unconnected";
  const channelLabel =
    channelState === "connected"
      ? (youtubeConnection?.channelTitle ?? "Channel connected")
      : youtubeConnection?.status === "needs_reauth"
        ? "Reconnect required"
        : "Channel not connected";

  const handleSignOut = async (): Promise<void> => {
    await signOutMutation.mutateAsync();
    router.push("/signin");
    router.refresh();
  };

  return (
    <div className="flex h-full flex-col bg-[color:var(--surface)]">
      <div className="flex h-14 items-center px-5">
        <Link
          href="/dashboard"
          aria-label="ClipFlow home"
          className="inline-flex"
          onClick={() => onNavigate?.()}
        >
          <Logo />
        </Link>
      </div>

      <nav className="flex-1 px-3 py-2">
        <ul className="space-y-0.5">
          {PRIMARY_NAV.map((item) => {
            const active =
              item.enabled &&
              (item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname === item.href ||
                  pathname.startsWith(`${item.href}/`));
            const Icon = item.icon;
            const className = cn(
              "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              item.enabled ? "" : "cursor-not-allowed opacity-60",
              active
                ? "bg-[color:var(--bg)] text-[color:var(--ink)] ring-1 ring-[color:var(--line)]"
                : item.enabled
                  ? "text-[color:var(--ink-muted)] hover:bg-[color:var(--bg)]/60 hover:text-[color:var(--ink)]"
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
                <Link
                  href={item.href}
                  className={className}
                  onClick={() => onNavigate?.()}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-[color:var(--line)] px-3 py-3">
        <div
          className="flex items-center gap-2 rounded-md px-2 py-2 text-xs"
          aria-label="YouTube channel connection"
        >
          <span
            aria-hidden="true"
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              channelState === "connected"
                ? "bg-[color:var(--status-ready)]"
                : youtubeConnection?.status === "needs_reauth"
                  ? "bg-[color:var(--status-error)]"
                  : "bg-[color:var(--status-processing)]",
            )}
          />
          <span className="flex-1 truncate text-[color:var(--ink-muted)]">
            {channelLabel}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-1 px-1">
          <Link
            href="/dashboard/settings/profile"
            onClick={() => onNavigate?.()}
            className="flex-1 truncate rounded-md px-1.5 py-1 text-xs text-[color:var(--ink-muted)] transition-colors hover:bg-[color:var(--bg)]/60 hover:text-[color:var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            title="Open profile settings"
          >
            {session?.user?.email ?? "Signed in"}
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              void handleSignOut();
            }}
            aria-label="Sign out"
          >
            <LogOut aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}