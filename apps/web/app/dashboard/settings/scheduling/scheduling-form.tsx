"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { COMMON_TIMEZONES } from "@clipflow/types";
import { useAuth } from "@/hooks/use-auth";
import { useUpdatePreferences } from "@/hooks/use-update-preferences";

/**
 * Best-effort "detect my timezone" helper. Uses the browser's
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` (widely supported)
 * and falls back gracefully if the API isn't available — the user can
 * always pick from the dropdown.
 */
const detectBrowserTimezone = (): string | null => {
  if (typeof Intl === "undefined") return null;
  try {
    const opts = new Intl.DateTimeFormat().resolvedOptions();
    return opts.timeZone || null;
  } catch {
    return null;
  }
};

export function SchedulingForm() {
  const { preferences: prefs } = useAuth();
  const updatePrefs = useUpdatePreferences();

  const [timezone, setTimezone] = React.useState<string>(
    prefs?.defaultTimezone ?? "UTC",
  );
  const [publishTime, setPublishTime] = React.useState<string>(
    prefs?.defaultPublishTime ?? "18:00",
  );
  const [localError, setLocalError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!prefs) return;
    setTimezone(prefs.defaultTimezone);
    setPublishTime(prefs.defaultPublishTime);
  }, [prefs]);

  // Build the timezone <option> list: curated COMMON_TIMEZONES first,
  // then the detected browser zone (if it isn't already in the list)
  // so a creator in a less-common zone sees their value surfaced.
  const tzOptions = React.useMemo(() => {
    const detected = detectBrowserTimezone();
    const list = [...COMMON_TIMEZONES];
    if (detected && !list.includes(detected as (typeof COMMON_TIMEZONES)[number])) {
      // Surface the detected zone at the top so the user can pick it
      // without scrolling — a "your zone" affordance.
      return [detected, ...list];
    }
    return list;
  }, []);

  const handleDetect = () => {
    const detected = detectBrowserTimezone();
    if (detected) {
      setTimezone(detected);
    } else {
      setLocalError("Couldn't detect your timezone automatically. Pick one from the list.");
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);
    try {
      await updatePrefs.mutateAsync({
        defaultTimezone: timezone,
        defaultPublishTime: publishTime,
      });
      toast.success("Scheduling defaults saved.");
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Couldn't save your scheduling defaults.");
    }
  };

  const saving = updatePrefs.isPending;
  const error = localError ?? (updatePrefs.error instanceof Error
    ? updatePrefs.error.message
    : null);

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="space-y-6"
      aria-label="Scheduling form"
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
        label="Default timezone"
        description="IANA timezone (e.g. Asia/Kolkata). The schedule picker uses this as its starting point."
      >
        <div className="flex items-stretch gap-2">
          <div className="flex-1">
            <Select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              options={tzOptions.map((tz) => ({ value: tz, label: tz }))}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleDetect}
            disabled={saving}
          >
            Detect
          </Button>
        </div>
      </FormField>

      <FormField
        label="Default publish time"
        description="24-hour local time (HH:MM). Used as the initial value on the schedule picker for each new video."
      >
        <Input
          type="time"
          value={publishTime}
          onChange={(e) => setPublishTime(e.target.value)}
        />
      </FormField>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
