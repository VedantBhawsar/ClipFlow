"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Minimal native `<select>` styled to match the rest of the design
 * system. We deliberately use the platform select (not Radix) for v1:
 * the settings surface is small, the native widget is accessible by
 * default, and the form factor is already constrained.
 *
 * Consumers can pass an array of `{ value, label }` via `options` or
 * provide children directly (`<option>`s). The two are mutually
 * exclusive — `options` wins if both are passed.
 */
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  options?: ReadonlyArray<SelectOption>;
}

/**
 * Native `<select>` with the same focus-ring / disabled state pattern
 * as the other form primitives. Keep its API in sync with `Input`.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          "flex h-9 w-full appearance-none rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
          // Subtle chevron via inline SVG; doesn't add a dep.
          "bg-[length:1rem] bg-[right_0.625rem_center] bg-no-repeat pr-8",
          "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236B6D66%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%226 9 12 15 18 9%22/></svg>')]",
          className,
        )}
        {...props}
      >
        {options
          ? options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))
          : children}
      </select>
    );
  },
);
Select.displayName = "Select";
