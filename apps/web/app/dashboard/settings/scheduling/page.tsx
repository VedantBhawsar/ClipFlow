import { SchedulingForm } from "./scheduling-form";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";

export const metadata = {
  title: "Scheduling — ClipFlow",
};

export default function SchedulingSettingsPage() {
  return (
    <div className="space-y-8">
      <SettingsPageHeader
        title="Scheduling"
        description="The defaults ClipFlow uses when you schedule a new video. You can still override these on a per-video basis from the schedule picker."
      />
      <SchedulingForm />
    </div>
  );
}
