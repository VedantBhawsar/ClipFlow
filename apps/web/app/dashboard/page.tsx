import type { Metadata } from "next";

import { DashboardContent } from "./dashboard-content";

export const metadata: Metadata = {
  title: "Dashboard — ClipFlow",
  description: "Your publishing pipeline at a glance.",
};

/**
 * Dashboard route entry. Stays a server component so we can export
 * `metadata` (client components can't); the data fetching and
 * rendering live in <DashboardContent /> (client), which consumes
 * the existing TanStack Query bundle cache that AuthProvider warms
 * on mount. See ./dashboard-content.tsx for the rationale on going
 * client-side here.
 */
export default function DashboardPage() {
  return <DashboardContent />;
}
