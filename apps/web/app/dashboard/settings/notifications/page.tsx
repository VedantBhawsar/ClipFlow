import { NotificationsForm } from "./notifications-form";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";

export const metadata = {
  title: "Notifications — ClipFlow",
};

export default function NotificationsSettingsPage() {
  return (
    <div className="space-y-8">
      <SettingsPageHeader
        title="Notifications"
        description="Email alerts about the videos you upload and the health of your YouTube connection. The signature moments — published, failed, needs reauth — are on by default because silent failures are the trust-breaking event this product is designed to prevent."
      />
      <NotificationsForm />
    </div>
  );
}
