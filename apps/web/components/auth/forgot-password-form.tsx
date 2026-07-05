"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createApiClient } from "@/lib/api-client";

const forgotPasswordSchema = z.object({
  email: z.string().min(1, "Enter your email.").email("Enter a valid email address."),
});

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordForm() {
  const [isSuccess, setIsSuccess] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    setIsSuccess(false);
    try {
      const anonApi = createApiClient(null);
      await anonApi.forgotPassword(values);
      setIsSuccess(true);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Try again.",
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
          <p className="font-medium">Check your inbox</p>
          <p className="mt-1 text-muted-foreground">
            If an account with that email exists, we&apos;ve sent a password reset link. It expires in 1 hour.
          </p>
        </div>
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/signin" className="font-medium text-foreground underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
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
        <Label htmlFor="forgot-email">Email</Label>
        <div className="relative">
          <Input
            id="forgot-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={errors.email ? "true" : undefined}
            className="pl-9"
            {...register("email")}
          />
          <Mail
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
        </div>
        {errors.email ? (
          <p className="text-xs text-destructive">{errors.email.message}</p>
        ) : null}
      </div>

      <Button type="submit" disabled={isSubmitting} className="mt-1">
        {isSubmitting ? "Sending…" : "Send reset link"}
      </Button>

      <p className="pt-2 text-center text-sm text-muted-foreground">
        Remember your password?{" "}
        <Link href="/signin" className="font-medium text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
