/**
 * Static option lists for the onboarding wizard + settings profile form.
 *
 * Centralized so the two surfaces stay in sync — the wizard and the
 * settings page render the same enums with the same labels, and a
 * change here updates both.
 */
import type { ContentNiche, PrimaryGoal, UploadFrequency } from "@clipflow/types";

export interface OptionItem<T extends string> {
  value: T;
  label: string;
  description?: string;
}

export const NICHE_OPTIONS: ReadonlyArray<OptionItem<ContentNiche>> = [
  { value: "GAMING", label: "Gaming" },
  { value: "TECH_EDUCATION", label: "Tech & education" },
  { value: "VLOG_LIFESTYLE", label: "Vlog & lifestyle" },
  { value: "BUSINESS_FINANCE", label: "Business & finance" },
  { value: "ENTERTAINMENT_COMEDY", label: "Entertainment & comedy" },
  { value: "OTHER", label: "Other" },
];

export const UPLOAD_FREQUENCY_OPTIONS: ReadonlyArray<OptionItem<UploadFrequency>> = [
  { value: "ONE_TO_FOUR", label: "1 – 4 videos / month" },
  { value: "FIVE_TO_TEN", label: "5 – 10 videos / month" },
  { value: "ELEVEN_TO_TWENTY", label: "11 – 20 videos / month" },
  { value: "TWENTY_PLUS", label: "20+ videos / month" },
];

export const PRIMARY_GOAL_OPTIONS: ReadonlyArray<OptionItem<PrimaryGoal>> = [
  { value: "SAVE_TIME_EDITING", label: "Save time editing" },
  { value: "BETTER_THUMBNAILS_CTR", label: "Better thumbnails & CTR" },
  { value: "CONSISTENT_SCHEDULE", label: "Consistent posting schedule" },
  { value: "GROW_VIEWS", label: "Grow views" },
];
