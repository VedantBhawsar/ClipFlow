import { Suspense } from "react";
import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignUpForm } from "@/components/auth/signup-form";

export const metadata: Metadata = {
  title: "Sign up — ClipFlow",
  description: "Create a ClipFlow account.",
};

export default function SignUpPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Create your account</CardTitle>
        <CardDescription>
          A few seconds and you&apos;re ready to schedule your first video.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<div className="h-96 animate-pulse rounded-md bg-muted" />}>
          <SignUpForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
