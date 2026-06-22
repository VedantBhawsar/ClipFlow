"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface PasswordInputProps extends Omit<React.ComponentProps<"input">, "type"> {
  /**
   * Accessible label for the toggle button. Override per-locale.
   */
  toggleLabel?: {
    show: string;
    hide: string;
  };
}

/**
 * Password field with an inline show/hide toggle. Keeps the original
 * <input> semantics (so react-hook-form controllers Just Work) and only
 * swaps the type and aria-pressed on the trigger button.
 */
export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, toggleLabel, disabled, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);
    const labels = toggleLabel ?? { show: "Show password", hide: "Hide password" };

    return (
      <div className={cn("relative", className)}>
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          className="pr-10"
          disabled={disabled}
          {...props}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:bg-transparent"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? labels.hide : labels.show}
          aria-pressed={visible}
          tabIndex={-1}
          disabled={disabled}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";
