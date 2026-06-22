"use client";

import * as React from "react";
import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * Standardized settings form field.
 *
 * Wraps a control (`children`) with a label, an optional helper
 * description, and an optional error message. Replaces the ad-hoc
 * `<Label> + <p className="text-xs text-muted-foreground">` pattern
 * in onboarding so every settings form has a consistent vertical
 * rhythm.
 *
 * Accessibility: the description and error are linked to the inner
 * control via `aria-describedby`, and the error is announced via
 * `aria-invalid` on the child control. We don't render the link
 * attributes here — the consumer is expected to spread
 * `aria-describedby` onto the input, or to compose by passing
 * `error` alongside a control that already understands it.
 */
export interface FormFieldProps {
  label: string;
  /**
   * Optional helper text shown below the control. Use for unit hints
   * (e.g. "IANA timezone, e.g. Asia/Kolkata") or short explanations.
   */
  description?: string;
  /**
   * Optional error string. When present, shown in destructive text
   * below the control and exposed via the `field-state` data attribute
   * so the consumer can style accordingly.
   */
  error?: string | null;
  /**
   * Forwarded to the wrapping `<div>` for layout (e.g. "space-y-2").
   */
  className?: string;
  children: React.ReactNode;
}

export function FormField({
  label,
  description,
  error,
  className,
  children,
}: FormFieldProps) {
  const reactId = useId();
  const descriptionId = `${reactId}-desc`;
  const errorId = `${reactId}-err`;
  const describedBy =
    [description ? descriptionId : null, error ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div
      className={cn("space-y-1.5", className)}
      data-field-state={error ? "invalid" : "valid"}
    >
      <label
        htmlFor={reactId}
        className="text-sm font-medium leading-none text-foreground"
      >
        {label}
      </label>
      {description ? (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}
      <div
        // The inner control gets the synthesized id so the label click
        // still focuses it (the consumer can also pass their own id
        // via the children — useId is stable per instance).
        data-described-by={describedBy}
        className="contents"
      >
        {/* Inject the synthesized id and describedBy onto the child
            control. We can't reach into arbitrary children, so we use
            a small cloneElement pattern for the common case where the
            child is a single React element. For more complex cases
            the consumer can compose manually. */}
        {React.isValidElement(children)
          ? React.cloneElement(
              children as React.ReactElement<Record<string, unknown>>,
              {
                id: reactId,
                "aria-describedby": describedBy,
                "aria-invalid": error ? true : undefined,
              },
            )
          : children}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
