"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/auth/password-input";
import { GoogleButton } from "@/components/auth/google-button";
import { useSignUp } from "@/hooks/use-sign-up";

/**
 * Password rule checkers. Split out so the live hints under the password
 * field and the final submit-time validator share one source of truth.
 */
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

const signUpSchema = z
  .object({
    name: z.string().max(80, "Name is too long.").optional(),
    email: z.string().min(1, "Enter your email.").email("Enter a valid email address."),
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

type SignUpValues = z.infer<typeof signUpSchema>;

/**
 * Email + password sign-up form. Live password-strength hints update as
 * the user types; final validation runs on submit. On success the auth
 * context is populated and we send the new user to /onboarding/profile
 * to answer the four setup questions.
 *
 * Registration flows:
 *  1. `useSignUp()` POSTs to Express `/api/auth/register` to create
 *     the account, which returns the initial access + refresh tokens.
 *  2. It then calls NextAuth's `signIn("credentials", ...)` so the
 *     tokens get persisted in NextAuth's httpOnly session cookie.
 *  3. We route to /onboarding/profile. The freshly-created user has
 *     no profile yet so OnboardingGuard accepts the navigation.
 */
export function SignUpForm() {
  const router = useRouter();
  const signUpMutation = useSignUp();
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [passwordValue, setPasswordValue] = React.useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
    mode: "onTouched",
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await signUpMutation.mutateAsync({
        email: values.email,
        password: values.password,
        ...(values.name && values.name.trim().length > 0
          ? { name: values.name.trim() }
          : {}),
      });
      router.push("/onboarding/profile");
      router.refresh();
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Couldn't create your account. Try again.",
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
        <Label htmlFor="signup-name">Name (optional)</Label>
        <Input
          id="signup-name"
          type="text"
          autoComplete="name"
          placeholder="Your name or channel name"
          aria-invalid={errors.name ? "true" : undefined}
          {...register("name")}
        />
        {errors.name ? (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
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
        <Label htmlFor="signup-password">Password</Label>
        <PasswordInput
          id="signup-password"
          autoComplete="new-password"
          aria-invalid={errors.password ? "true" : undefined}
          {...register("password", {
            onChange: (e) => setPasswordValue(e.target.value),
          })}
        />
        {/* Live password rule hints — never block typing. */}
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
        <Label htmlFor="signup-confirm-password">Confirm password</Label>
        <PasswordInput
          id="signup-confirm-password"
          autoComplete="new-password"
          aria-invalid={errors.confirmPassword ? "true" : undefined}
          {...register("confirmPassword")}
        />
        {errors.confirmPassword ? (
          <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
        ) : null}
      </div>

      <Button type="submit" disabled={isSubmitting} className="mt-1">
        {isSubmitting ? "Creating account…" : "Create account"}
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
        Already have an account?{" "}
        <Link href="/signin" className="font-medium text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}