import { GenerationForm } from "./generation-form";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";

export const metadata = {
  title: "Generation — ClipFlow",
};

export default function GenerationSettingsPage() {
  return (
    <div className="space-y-8">
      <SettingsPageHeader
        title="Generation"
        description="How ClipFlow produces chapters and thumbnails for your videos. The defaults work for most creators; tweak these if you want a different style or want chapters applied automatically."
      />
      <GenerationForm />
    </div>
  );
}
