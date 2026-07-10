"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import type { SubscriptionResponse } from "@clipflow/types";

export default function BillingSuccessPage() {
  const router = useRouter();
  const api = useApi();
  const [planName, setPlanName] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  const poll = useCallback(async () => {
    try {
      const data = await api.getSubscription() as SubscriptionResponse;
      if (data.subscription.status === "ACTIVE") {
        setPlanName(data.plan.name);
        return true;
      }
    } catch {}
    return false;
  }, [api]);

  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 15;
    const interval = setInterval(async () => {
      attempts++;
      const done = await poll();
      if (done) {
        clearInterval(interval);
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        setTimedOut(true);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [poll]);

  if (planName) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-medium text-[color:var(--ink)]">
            Welcome to {planName}!
          </h1>
          <p className="mt-2 text-[color:var(--ink-muted)]">
            Your subscription is active. Start uploading videos.
          </p>
          <Button className="mt-6" onClick={() => router.push("/dashboard")}>
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (timedOut) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-medium text-[color:var(--ink)]">
            Payment received
          </h1>
          <p className="mt-2 text-[color:var(--ink-muted)]">
            Your payment was received. Refresh in a moment to see your plan.
          </p>
          <Button className="mt-6" onClick={poll}>
            Check again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-[color:var(--ink-muted)]">Confirming your payment…</p>
    </div>
  );
}
