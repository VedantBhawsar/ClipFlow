"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useChangePassword } from "@/hooks/use-change-password";

interface FormState {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const INITIAL: FormState = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

/**
 * Live password rule checkers. Reused from the signup form so the
 * "what counts as a strong password" rule is one source of truth
 * (the server enforces the same rule in passwordSchema).
 */
const passwordRules = {
  minLength: (v: string) => v.length >= 8,
  hasLetter: (v: string) => /[A-Za-z]/.test(v),
  hasNumber: (v: string) => /\d/.test(v),
};

const RULE_LIST = [
  { id: "minLength", label: "At least 8 characters", check: passwordRules.minLength },
  { id: "hasLetter", label: "Contains a letter", check: passwordRules.hasLetter },
  { id: "hasNumber", label: "Contains a number", check: passwordRules.hasNumber },
] as const;

export function ChangePasswordForm() {
  const router = useRouter();
  const changePassword = useChangePassword();
  const [form, setForm] = React.useState<FormState>(INITIAL);
  const [success, setSuccess] = React.useState(false);

  const setField = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setSuccess(false);
  };

  const newMeetsRules = React.useMemo(
    () => RULE_LIST.every((r) => r.check(form.newPassword)),
    [form.newPassword],
  );
  const passwordsMatch = form.newPassword === form.confirmPassword;
  const passwordsDiffer = form.currentPassword !== form.newPassword;
  const isValid =
    form.currentPassword.length > 0 &&
    newMeetsRules &&
    passwordsMatch &&
    passwordsDiffer;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValid) return;
    try {
      await changePassword.mutateAsync({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setSuccess(true);
      setForm(INITIAL);
      toast.success("Password updated.");
      // The JWT is unchanged, so the user stays signed in on this
      // device. We refresh the dashboard data so any cached "this
      // account uses Google" derivation gets re-read.
      router.refresh();
    } catch {
      // The mutation's `error` state already holds the thrown Error;
      // the `error` derivation below renders it in the alert banner.
      // Also clear the success flag so an old success message doesn't
      // linger if the user retries.
      setSuccess(false);
    }
  };

  const submitting = changePassword.isPending;
  const error = changePassword.error instanceof Error
    ? changePassword.error.message
    : null;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="max-w-md space-y-6"
      aria-label="Change password form"
    >
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}
      {success ? (
        <div
          role="status"
          className="rounded-md border border-status-ready/30 bg-status-ready/5 px-3 py-2 text-sm text-status-ready"
        >
          Your password is updated. You&apos;re still signed in here.
        </div>
      ) : null}

      <FormField
        label="Current password"
        description="We need to verify it's you before changing anything."
      >
        <Input
          type="password"
          autoComplete="current-password"
          value={form.currentPassword}
          onChange={setField("currentPassword")}
        />
      </FormField>

      <FormField
        label="New password"
        description="At least 8 characters, with a letter and a number."
      >
        <Input
          type="password"
          autoComplete="new-password"
          value={form.newPassword}
          onChange={setField("newPassword")}
        />
        <ul className="mt-1 space-y-0.5 text-xs" aria-label="Password requirements">
          {RULE_LIST.map((rule) => {
            const met = rule.check(form.newPassword);
            return (
              <li
                key={rule.id}
                className={
                  met
                    ? "text-foreground"
                    : "text-muted-foreground"
                }
              >
                {met ? "✓ " : "· "}
                {rule.label}
              </li>
            );
          })}
        </ul>
      </FormField>

      <FormField
        label="Confirm new password"
        error={
          form.confirmPassword.length > 0 && !passwordsMatch
            ? "Passwords don't match."
            : null
        }
      >
        <Input
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={setField("confirmPassword")}
        />
      </FormField>

      {form.newPassword.length > 0 && !passwordsDiffer ? (
        <p className="text-xs text-destructive">
          Your new password must be different from your current one.
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button
          type="submit"
          disabled={submitting || !isValid}
        >
          {submitting ? "Updating…" : "Update password"}
        </Button>
      </div>
    </form>
  );
}
