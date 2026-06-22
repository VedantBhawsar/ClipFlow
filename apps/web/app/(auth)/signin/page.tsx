import type { Metadata } from "next";
import { Suspense } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignInForm } from "@/components/auth/signin-form";

export const metadata: Metadata = {
  title: "Sign in — ClipFlow",
  description: "Sign in to your ClipFlow account.",
};

// SignInForm calls useSearchParams() to honor ?next= from the middleware.
// In Next 15+, that hook forces a CSR bailout, so it has to live inside a
// Suspense boundary — otherwise the page can't be prerendered.
export default function SignInPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Sign in</CardTitle>
        <CardDescription>
          Welcome back. Pick up where you left off.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={null}>
          <SignInForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
