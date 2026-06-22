"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  User,
  Bell,
  Clock,
  Sparkles,
  Youtube,
  Lock,
  Sun,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

interface SettingsNavItem {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

const SETTINGS_NAV: ReadonlyArray<SettingsNavItem> = [
  {
    href: "/settings/profile",
    label: "Profile",
    description: "Channel name, niche, and goals.",
    icon: User,
  },
  {
    href: "/settings/notifications",
    label: "Notifications",
    description: "Email alerts for video status and account health.",
    icon: Bell,
  },
  {
    href: "/settings/scheduling",
    label: "Scheduling",
    description: "Default timezone and publish time for new videos.",
    icon: Clock,
  },
  {
    href: "/settings/generation",
    label: "Generation",
    description: "How chapters and thumbnails are produced.",
    icon: Sparkles,
  },
  {
    href: "/settings/connected",
    label: "YouTube connection",
    description: "Channel connection status and reconnect.",
    icon: Youtube,
  },
  {
    href: "/settings/security",
    label: "Security",
    description: "Change your password.",
    icon: Lock,
  },
  {
    href: "/settings/appearance",
    label: "Appearance",
    description: "Light, dark, or system theme.",
    icon: Sun,
  },
];

interface SettingsNavProps {
  className?: string;
}

/**
 * Inner sidebar for the settings area. Renders a vertical list of
 * section links. Each item shows the icon, label, and a one-line
 * description (subdued) so the user can tell at a glance which
 * section does what — no hover-required tooltips needed.
 */
export function SettingsNav({ className }: SettingsNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Settings sections"
      className={cn("space-y-0.5", className)}
    >
      <ul>
        {SETTINGS_NAV.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex items-start gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Icon
                  className="mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                <span className="flex flex-col">
                  <span
                    className={cn(
                      "font-medium",
                      active ? "text-foreground" : "text-foreground/90",
                    )}
                  >
                    {item.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.description}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export { SETTINGS_NAV };
