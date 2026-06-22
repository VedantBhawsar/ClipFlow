import * as React from "react";

import { cn } from "@/lib/utils";

interface LogoProps extends React.SVGAttributes<SVGSVGElement> {
  /** "wordmark" includes the wordmark, "mark" is just the icon. */
  variant?: "wordmark" | "mark";
}

/**
 * Small SVG logo for ClipFlow. Two-tone: the icon is the accent color and
 * the wordmark uses the foreground token, so it tracks dark mode.
 *
 * Inline SVG rather than an external asset keeps it crisp at any size and
 * avoids an extra network round-trip on the landing/auth pages.
 */
export function Logo({ className, variant = "wordmark", ...props }: LogoProps) {
  return (
    <svg
      viewBox="0 0 132 28"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="ClipFlow"
      role="img"
      className={cn("h-7 w-auto", className)}
      {...props}
    >
      <g aria-hidden="true">
        {/* Icon: a soft rounded square with a triangular "play" notch. */}
        <rect
          x="1"
          y="2"
          width="24"
          height="24"
          rx="6"
          fill="currentColor"
          className="text-primary"
        />
        <path
          d="M9 9 L19 14 L9 19 Z"
          fill="currentColor"
          className="text-primary-foreground"
        />
      </g>
      {variant === "wordmark" ? (
        <text
          x="32"
          y="19"
          fontFamily="var(--font-inter-tight), system-ui, sans-serif"
          fontSize="15"
          fontWeight="600"
          fill="currentColor"
          className="text-foreground"
          letterSpacing="-0.01em"
        >
          ClipFlow
        </text>
      ) : null}
    </svg>
  );
}
