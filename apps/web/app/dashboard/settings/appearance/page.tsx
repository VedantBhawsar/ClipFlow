import { AppearanceForm } from "./appearance-form";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";

export const metadata = {
  title: "Appearance — ClipFlow",
};

export default function AppearanceSettingsPage() {
  return (
    <div className="space-y-8">
      <SettingsPageHeader
        title="Appearance"
        description="Switch between light, dark, and follow-system. ClipFlow's status palette stays muted in both themes — the colors carry meaning, not decoration."
      />
      <AppearanceForm />
    </div>
  );
}
