"use client";

import * as React from "react";

import { SettingsNav } from "@/components/settings/settings-nav";
import { cn } from "@/lib/utils";

interface SettingsLayoutProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Two-column layout for the settings area.
 *
 * Renders the inner settings nav on the left and the page content on
 * the right. The whole settings area lives inside the existing 960-wide
 * content shell provided by the dashboard layout, so the layout here
 * is intentionally narrow: the nav column is 224px, the content
 * column takes the rest. Collapses to a single column on small screens
 * (nav on top, content below).
 */
export function SettingsLayout({ children, className }: SettingsLayoutProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-12",
        className,
      )}
    >
      <aside className="lg:w-56 lg:shrink-0">
        <SettingsNav />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
