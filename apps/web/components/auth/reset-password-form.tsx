"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/auth/password-input";
import { createApiClient } from "@/lib/api-client";

const passwordRules = {
  minLength: (v: string) => v.length >= 8,
  hasLetter: (v: string) => /[A-Za-z]/.test(v),
  hasNumber: (v: string) => /\d/.test(v),
};

const passwordRuleList = [
  { id: "minLength", label: "At least 8 characters", check: passwordRules.minLength },
  { id: "hasLetter", label: "Contains a letter", check: passwordRules.hasLetter },
  { id: "hasNumber", label: "Contains a number", check: passwordRules.hasNumber },
] as const;

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .refine(passwordRules.hasLetter, "Password must contain a letter.")
      .refine(passwordRules.hasNumber, "Password must contain a number."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });

type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter();
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [passwordValue, setPasswordValue] = React.useState("");
  const [isSuccess, setIsSuccess] = React.useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
    mode: "onTouched",
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    setIsSuccess(false);
    try {
      const anonApi = createApiClient(null);
      await anonApi.resetPassword({ token, password: values.password });
      setIsSuccess(true);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Couldn't reset your password. Try again.",
      );
    }
  });

  if (isSuccess) {
    return (
      <div className="flex flex-col gap-4">
        <div
          role="status"
          className="rounded-md border border-status-ready/30 bg-status-ready/5 px-3 py-3 text-sm text-foreground"
        >
          <p className="font-medium">Password reset successfully</p>
          <p className="mt-1 text-muted-foreground">
            You can now sign in with your new password.
          </p>
        </div>
        <Button onClick={() => router.push("/signin")}>
          Sign in
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {submitError ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {submitError}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="reset-password">New password</Label>
        <PasswordInput
          id="reset-password"
          autoComplete="new-password"
          aria-invalid={errors.password ? "true" : undefined}
          {...register("password", {
            onChange: (e) => setPasswordValue(e.target.value),
          })}
        />
        <ul className="mt-1 space-y-0.5 text-xs" aria-label="Password requirements">
          {passwordRuleList.map((rule) => {
            const met = rule.check(passwordValue);
            return (
              <li
                key={rule.id}
                className={
                  met
                    ? "flex items-center gap-1.5 text-foreground"
                    : "flex items-center gap-1.5 text-muted-foreground"
                }
              >
                {met ? (
                  <Check className="h-3 w-3 text-status-ready" aria-hidden="true" />
                ) : (
                  <X className="h-3 w-3" aria-hidden="true" />
                )}
                <span>{rule.label}</span>
              </li>
            );
          })}
        </ul>
        {errors.password ? (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reset-confirm-password">Confirm new password</Label>
        <PasswordInput
          id="reset-confirm-password"
          autoComplete="new-password"
          aria-invalid={errors.confirmPassword ? "true" : undefined}
          {...register("confirmPassword")}
        />
        {errors.confirmPassword ? (
          <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
        ) : null}
      </div>

      <Button type="submit" disabled={isSubmitting} className="mt-1">
        {isSubmitting ? "Resetting…" : "Reset password"}
      </Button>

      <p className="pt-2 text-center text-sm text-muted-foreground">
        <Link href="/signin" className="font-medium text-foreground underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
