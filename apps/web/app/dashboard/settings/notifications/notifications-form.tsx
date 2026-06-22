"use client";

import * as React from "react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api-client";
import type { UserPreferences } from "@clipflow/types";

interface ToggleRow {
  key: keyof Pick<
    UserPreferences,
    | "notifyProcessingComplete"
    | "notifyPublished"
    | "notifyPublishFailed"
    | "notifyNeedsReauth"
    | "notifyWeeklySummary"
  >;
  title: string;
  description: string;
}

const TOGGLES: ReadonlyArray<ToggleRow> = [
  {
    key: "notifyProcessingComplete",
    title: "When a video finishes processing",
    description:
      "Sent once the transcript, chapters, and thumbnails are ready for your review.",
  },
  {
    key: "notifyPublished",
    title: "When a video goes live on YouTube",
    description: "Sent the moment your scheduled publish succeeds.",
  },
  {
    key: "notifyPublishFailed",
    title: "When a scheduled publish fails",
    description:
      "Sent if a publish job fails (auth error, quota, etc.) with a clear next step.",
  },
  {
    key: "notifyNeedsReauth",
    title: "When YouTube needs to be reconnected",
    description:
      "Sent when your refresh token is revoked or expires — best caught before your next scheduled publish fails.",
  },
  {
    key: "notifyWeeklySummary",
    title: "Weekly summary",
    description:
      "A Monday-morning rollup of what you published, what's scheduled, and what's still in review.",
  },
];

interface NotificationsFormProps {
  /**
   * Optional override — when provided, the form renders against this
   * snapshot instead of the auth context. Useful for tests and for
   * the future "load from server" pattern.
   */
  initial?: UserPreferences | null;
}

export function NotificationsForm({ initial }: NotificationsFormProps = {}) {
  const { preferences: contextPrefs, patchPreferences } = useAuth();
  const prefs = initial ?? contextPrefs;

  // Local optimistic state. Saves are debounced to the patch call —
  // a switch flips immediately and the patch fires on the next tick.
  const [local, setLocal] = React.useState<UserPreferences | null>(prefs);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // When the auth context's preferences hydrate, mirror them in local
  // state. This handles the "settings page opened before hydration
  // finishes" case.
  React.useEffect(() => {
    if (prefs && local === null) setLocal(prefs);
  }, [prefs, local]);

  // Per-toggle dirty tracking so the user only saves what they touched.
  // For simplicity (and because the patch endpoint is cheap), we just
  // collect every flipped key and send them in one PATCH on Save.
  const [pending, setPending] = React.useState<
    Partial<Record<keyof UserPreferences, boolean>>
  >({});

  const flipToggle = (key: ToggleRow["key"], next: boolean) => {
    setLocal((prev) => (prev ? { ...prev, [key]: next } : prev));
    setPending((p) => ({ ...p, [key]: next }));
  };

  const handleSave = async () => {
    if (!local) return;
    if (Object.keys(pending).length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await patchPreferences(pending);
      setLocal(updated);
      setPending({});
      toast.success("Notification preferences saved.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't save your notification preferences.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!local) {
    return (
      <p className="text-sm text-muted-foreground">Loading preferences…</p>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {TOGGLES.map((t) => {
          const value = Boolean(local[t.key]);
          return (
            <li
              key={t.key}
              className="flex items-start justify-between gap-4 px-4 py-4"
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm font-medium text-foreground">
                  {t.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t.description}
                </p>
              </div>
              <Switch
                checked={value}
                onCheckedChange={(next) => flipToggle(t.key, next)}
                label={t.title}
                disabled={saving}
              />
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={saving || Object.keys(pending).length === 0}
          onClick={() => {
            // Reset to the auth-context snapshot.
            if (prefs) {
              setLocal(prefs);
              setPending({});
            }
          }}
        >
          Discard changes
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving || Object.keys(pending).length === 0}
        >
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
