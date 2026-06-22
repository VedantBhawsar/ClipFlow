"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system";

interface OptionDef {
  value: Theme;
  label: string;
  description: string;
  previewClass: string;
}

const OPTIONS: ReadonlyArray<OptionDef> = [
  {
    value: "light",
    label: "Light",
    description: "Warm-neutral background, dark text.",
    previewClass: "bg-[#FAFAF8] border-[#E4E3DC]",
  },
  {
    value: "dark",
    label: "Dark",
    description: "Olive-black background, light text.",
    previewClass: "bg-[#16170F] border-[#2E2F25]",
  },
  {
    value: "system",
    label: "System",
    description: "Match your operating-system preference.",
    previewClass: "bg-gradient-to-r from-[#FAFAF8] to-[#16170F] border-[#E4E3DC]",
  },
];

/**
 * Three-option segmented control for theme selection. Each option
 * shows a swatch (the background color in that theme) plus a label
 * and short description. The currently-active option gets the
 * accent border.
 *
 * Theme is persisted by `next-themes` (already wired in the root
 * layout) and applies to the `<html>` class instantly — no API call.
 */
export function AppearanceForm() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  // `next-themes` returns `undefined` for theme on the first render
  // (before hydration). We treat that as "system" so the UI doesn't
  // flicker an empty selection.
  const current: Theme = (theme as Theme | undefined) ?? "system";
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
    >
      {OPTIONS.map((opt) => {
        const active = mounted ? current === opt.value : opt.value === "system";
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(opt.value)}
            className={cn(
              "group flex flex-col items-start gap-2 rounded-lg border bg-card p-4 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              active
                ? "border-primary ring-1 ring-primary/30"
                : "border-border hover:border-muted-foreground/40",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "h-10 w-full rounded-md border",
                opt.previewClass,
              )}
            />
            <span className="flex w-full items-center justify-between">
              <span className="text-sm font-medium text-foreground">
                {opt.label}
              </span>
              {active ? (
                <Check
                  className="h-4 w-4 text-primary"
                  aria-hidden="true"
                />
              ) : null}
            </span>
            <span className="text-xs text-muted-foreground">
              {opt.description}
            </span>
          </button>
        );
      })}
      <p className="col-span-full text-xs text-muted-foreground" aria-live="polite">
        Currently displaying: <span className="font-medium text-foreground">{resolvedTheme ?? "system"}</span>.
      </p>
    </div>
  );
}
