import { ChangePasswordForm } from "./change-password-form";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";

export const metadata = {
  title: "Security — ClipFlow",
};

export default function SecuritySettingsPage() {
  return (
    <div className="space-y-8">
      <SettingsPageHeader
        title="Security"
        description="Change your password. After saving, you'll stay signed in on this device — other devices will need to sign in again with the new password."
      />
      <ChangePasswordForm />
    </div>
  );
}
