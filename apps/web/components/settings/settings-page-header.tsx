"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

interface SettingsPageHeaderProps {
  title: string;
  description?: string;
  className?: string;
}

/**
 * Consistent page header for every settings page. Keeps the heading
 * size + subhead rhythm identical so the user can scan the section
 * without the heading itself being a focus-distraction.
 */
export function SettingsPageHeader({
  title,
  description,
  className,
}: SettingsPageHeaderProps) {
  return (
    <header className={cn("space-y-1", className)}>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {description ? (
        <p className="max-w-prose text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
    </header>
  );
}
