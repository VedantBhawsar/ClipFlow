import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Definition-list row used by the video detail page's metadata block
 * and (in the future) settings detail pages. The label is always
 * uppercase + tracked to read as a field name, the value uses normal
 * text weight.
 *
 * `span={2}` makes the row span both columns of a 2-col dl grid on
 * `sm+` viewports — used for free-form fields like description and
 * tags that wrap poorly when squeezed.
 */
export function DetailRow({
  label,
  children,
  span,
  muted,
}: {
  label: string;
  children: React.ReactNode;
  span?: 2;
  muted?: boolean;
}) {
  return (
    <div className={cn("space-y-1", span === 2 && "sm:col-span-2")}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--ink-muted)]">
        {label}
      </dt>
      <dd
        className={cn(
          muted
            ? "text-[color:var(--ink-muted)]"
            : "text-[color:var(--ink)]",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

/** Em-dash placeholder for empty metadata fields. */
export function EmptyValue() {
  return (
    <span className="text-[color:var(--ink-muted)]" aria-label="Not set">
      —
    </span>
  );
}
