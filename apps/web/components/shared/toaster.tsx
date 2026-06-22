"use client";

import { Toaster as SonnerToaster } from "sonner";

/**
 * Mount-once toast container. `richColors` is off — we want ClipFlow's
 * own muted palette (sonner's defaults are loud against our bg), and
 * `closeButton` is enabled so users can dismiss persistent toasts.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border-border group-[.toaster]:shadow-sm",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-foreground",
        },
      }}
    />
  );
}
