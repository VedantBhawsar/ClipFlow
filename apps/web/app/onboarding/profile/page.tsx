import type { Metadata } from "next";

import { ProfileWizard } from "@/components/onboarding/profile-wizard";

export const metadata: Metadata = {
  title: "Set up your profile — ClipFlow",
  description: "A few quick questions to tailor ClipFlow to your channel.",
};

export default function OnboardingProfilePage() {
  return <ProfileWizard />;
}
