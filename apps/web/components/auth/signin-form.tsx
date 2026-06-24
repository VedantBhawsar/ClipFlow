"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/auth/password-input";
import { GoogleButton } from "@/components/auth/google-button";
import { useSignIn } from "@/hooks/use-sign-in";

const signInSchema = z.object({
  email: z.string().min(1, "Enter your email.").email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

type SignInValues = z.infer<typeof signInSchema>;

/**
 * Email + password sign-in form. Delegates to NextAuth's Credentials
 * provider via `useSignIn()` — the actual token storage is in
 * NextAuth's httpOnly session cookie. The form itself only handles
 * validation, navigation, and error display.
 *
 * Post-sign-in routing:
 *  1. Honor NextAuth's `?callbackUrl=` convention (the value the
 *     AuthGuard and middleware pass when bouncing unauthed users).
 *  2. Fall back to `?next=` for legacy callers.
 *  3. Otherwise `/dashboard`. OnboardingGuard will reroute from there
 *     if the user hasn't finished onboarding.
 *
 * Only same-origin paths are accepted (`/...` but not `//evil.com`)
 * so a malicious link can't redirect us off-site after sign-in.
 */
export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const signInMutation = useSignIn();
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await signInMutation.mutateAsync(values);
      const callbackUrl = searchParams.get("callbackUrl");
      const next = searchParams.get("next");
      const raw = callbackUrl ?? next ?? "/dashboard";
      const target =
        raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
      router.push(target);
      router.refresh();
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Couldn't sign in. Try again.",
      );
    }
  });

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
        <Label htmlFor="signin-email">Email</Label>
        <Input
          id="signin-email"
          type="email"
          autoComplete="email"
          aria-invalid={errors.email ? "true" : undefined}
          {...register("email")}
        />
        {errors.email ? (
          <p className="text-xs text-destructive">{errors.email.message}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="signin-password">Password</Label>
        <PasswordInput
          id="signin-password"
          autoComplete="current-password"
          aria-invalid={errors.password ? "true" : undefined}
          {...register("password")}
        />
        {errors.password ? (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        ) : null}
      </div>

      <Button type="submit" disabled={isSubmitting} className="mt-1">
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>

      <div className="relative my-2">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-card px-2 text-xs text-muted-foreground">or</span>
        </div>
      </div>

      <GoogleButton />

      <p className="pt-2 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
          Sign up
        </Link>
      </p>
    </form>
  );
}