import { redirect } from "next/navigation";

/**
 * Settings index. Redirects to the Profile section — that's the most
 * likely destination for a user landing here, and it keeps the URL
 * stable (no "index" route that might confuse deep-links).
 */
export default function SettingsIndexPage() {
  redirect("/dashboard/settings/profile");
}
