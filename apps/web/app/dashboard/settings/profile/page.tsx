import { ProfileForm } from "./profile-form";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";

export const metadata = {
  title: "Profile settings — ClipFlow",
};

export default function ProfileSettingsPage() {
  return (
    <div className="space-y-8">
      <SettingsPageHeader
        title="Profile"
        description="Your channel name, content niche, and goals. These personalize the dashboard and tune the way ClipFlow generates thumbnails and chapters."
      />
      <ProfileForm />
    </div>
  );
}
