"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  NICHE_OPTIONS,
  PRIMARY_GOAL_OPTIONS,
  UPLOAD_FREQUENCY_OPTIONS,
} from "@/lib/profile-options";
import { useAuth } from "@/hooks/use-auth";
import { useUpdateProfile } from "@/hooks/use-update-profile";
import type {
  ContentNiche,
  PrimaryGoal,
  UploadFrequency,
} from "@clipflow/types";

/**
 * Editable profile form. Reuses the same fields as the onboarding
 * wizard, but as a single page so users can fix a typo or change
 * their niche without re-running the wizard.
 *
 * Uses PATCH /api/onboarding/profile (partial update) so we don't
 * keep re-stamping the onboarding-completion timestamp on every save.
 */
export function ProfileForm() {
  const { profile } = useAuth();
  const { patch } = useUpdateProfile();

  const [displayName, setDisplayName] = React.useState(profile?.displayName ?? "");
  const [niche, setNiche] = React.useState<ContentNiche | "">(
    profile?.niche ?? "",
  );
  const [uploadFrequency, setUploadFrequency] = React.useState<
    UploadFrequency | ""
  >(profile?.uploadFrequency ?? "");
  const [primaryGoal, setPrimaryGoal] = React.useState<PrimaryGoal | "">(
    profile?.primaryGoal ?? "",
  );
  const [localError, setLocalError] = React.useState<string | null>(null);

  // If the bundle hydrates after mount, keep the form in sync. Without
  // this, opening /settings/profile before auth context finishes
  // hydrating would show an empty form.
  React.useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName ?? "");
    setNiche(profile.niche ?? "");
    setUploadFrequency(profile.uploadFrequency ?? "");
    setPrimaryGoal(profile.primaryGoal ?? "");
  }, [profile]);

  const isFormValid = React.useMemo(() => {
    return niche !== "" && uploadFrequency !== "" && primaryGoal !== "";
  }, [niche, uploadFrequency, primaryGoal]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);
    if (!isFormValid) {
      setLocalError("Pick a niche, upload frequency, and goal to continue.");
      return;
    }
    try {
      // Build a clean payload of just-the-fields-we-send. Empty
      // displayName is normalized to null on the wire; the server
      // treats null and "" equivalently here.
      const body = {
        displayName: displayName.trim().length > 0 ? displayName.trim() : null,
        niche: niche as ContentNiche,
        uploadFrequency: uploadFrequency as UploadFrequency,
        primaryGoal: primaryGoal as PrimaryGoal,
      };
      await patch.mutateAsync(body);
      toast.success("Profile saved.");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Couldn't save your profile.");
    }
  };

  const isSubmitting = patch.isPending;
  const error = localError ?? (patch.error instanceof Error
    ? patch.error.message
    : null);

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="space-y-6"
      aria-label="Profile form"
    >
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      <FormField
        label="Channel or display name"
        description="Shown at the top of your dashboard. Optional — leave blank to use your account email."
      >
        <Input
          type="text"
          maxLength={80}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="e.g. Pixel Loop"
        />
      </FormField>

      <FormField
        label="Content niche"
        description="Used to tune the thumbnail style preset to your content."
      >
        <Select
          value={niche}
          onChange={(e) => setNiche(e.target.value as ContentNiche | "")}
          options={[
            { value: "", label: "Select a niche…" },
            ...NICHE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
          ]}
        />
      </FormField>

      <FormField
        label="Upload frequency"
        description="Used to recommend a plan on the billing screen — never auto-charged."
      >
        <Select
          value={uploadFrequency}
          onChange={(e) => setUploadFrequency(e.target.value as UploadFrequency | "")}
          options={[
            { value: "", label: "Select a frequency…" },
            ...UPLOAD_FREQUENCY_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            })),
          ]}
        />
      </FormField>

      <FormField
        label="Primary goal"
        description="Tells the dashboard which feature to lead with for you."
      >
        <Select
          value={primaryGoal}
          onChange={(e) => setPrimaryGoal(e.target.value as PrimaryGoal | "")}
          options={[
            { value: "", label: "Select a goal…" },
            ...PRIMARY_GOAL_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            })),
          ]}
        />
      </FormField>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button
          type="submit"
          disabled={isSubmitting || !isFormValid}
        >
          {isSubmitting ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
