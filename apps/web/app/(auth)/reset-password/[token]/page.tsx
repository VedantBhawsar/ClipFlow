import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Reset password — ClipFlow",
  description: "Set a new password for your ClipFlow account.",
};

export default async function ResetPasswordPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Set new password</CardTitle>
        <CardDescription>Choose a strong password you haven&apos;t used before.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm token={token} />
      </CardContent>
    </Card>
  );
}
