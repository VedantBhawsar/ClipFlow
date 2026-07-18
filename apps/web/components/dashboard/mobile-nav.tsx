"use client";

import * as React from "react";
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { VisuallyHidden } from "radix-ui";

import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SidebarContent } from "@/components/dashboard/sidebar-content";

/**
 * Mobile navigation — left-edge drawer containing the same `<SidebarContent>`
 * that the desktop sidebar renders. Triggered by a Menu button in the
 * dashboard's mobile top bar (rendered by `dashboard/layout.tsx`).
 *
 * Auto-dismisses on route change: we watch `usePathname()` and close
 * the sheet whenever it changes, so tapping a nav item doesn't leave
 * the drawer hovering over the destination page.
 *
 * Rendered only below `lg` — the desktop sidebar takes over from
 * `lg:flex` upward, and the trigger is `lg:hidden` so the button is
 * hidden on desktop to avoid the duplicate-nav smell.
 */
export function MobileNav() {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  // Close the drawer whenever the route changes (after a nav item
  // click). We deliberately don't put `pathname` in the trigger's
  // onClick handler — `setOpen(false)` after the click would race
  // with Next's internal navigation. Watching pathname gives the
  // destination page time to commit before the drawer animates away.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Open navigation"
          className="lg:hidden"
        >
          <Menu strokeWidth={1.75} aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-64 max-w-[85vw] gap-0 border-r-[color:var(--line)] bg-[color:var(--surface)] p-0"
      >
        {/* Radix requires a Title for screen readers even when we're
            not rendering visible title copy in the drawer. VisuallyHidden
            keeps the chrome clean while satisfying the a11y requirement. */}
        <VisuallyHidden.Root>
          <SheetTitle>Navigation</SheetTitle>
        </VisuallyHidden.Root>
        <SidebarContent onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}