"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Minimal accessible switch.
 *
 * Implemented as a native `<button role="switch">` with a stateful
 * thumb, rather than pulling in @radix-ui/react-switch. We need three
 * of these for the notifications settings page; the Radix component
 * would add a dependency for a single small surface.
 *
 * Keyboard:
 *   - Tab to focus
 *   - Space / Enter to toggle
 *   - Disabled state is honored via aria-disabled + pointer-events
 */
export interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label?: string;
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked, onCheckedChange, label, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          checked ? "bg-primary" : "bg-muted",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
        {...props}
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-card shadow-sm transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-[2px]",
          )}
        />
      </button>
    );
  },
);
Switch.displayName = "Switch";
