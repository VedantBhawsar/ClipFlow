import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PublishedVideoList } from "@/components/dashboard/published-video-list";
import { auth } from "@/auth";

export const metadata: Metadata = {
  title: "Published — ClipFlow",
  description: "Your published video library.",
};

/**
 * `/dashboard/published` — the user's library of videos already on
 * YouTube.
 *
 * Companion page to `/dashboard`: that page is the "what's in flight"
 * view (uploads, scheduled, failed); this page is the "what's live"
 * view. Both source from the same `videos` table; the split is by
 * `status === "PUBLISHED"`.
 *
 * The list itself is rendered by `<PublishedVideoList />` — a client
 * component that owns the search box, the pagination, and the
 * empty/loading states. The page stays a server component so we can
 * export `metadata` and so the dashboard chrome (sidebar, header)
 * still SSRs into meaningful first paint.
 *
 * Server-side auth: NextAuth's `auth()` reads its own httpOnly session
 * cookie, runs the `jwt` callback (which may refresh the access token
 * silently), and returns the session object. We redirect on a
 * missing session; the list itself surfaces its own unauthenticated
 * state via the standard QueryCache 401 path.
 */
export default async function PublishedPage() {
  const session = await auth();
  if (!session?.accessToken) {
    redirect("/signin?next=/dashboard/published");
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Published</h1>
        <p className="text-sm text-muted-foreground">
          Every video you&apos;ve shipped to YouTube.
        </p>
      </header>

      <PublishedVideoList />
    </div>
  );
}