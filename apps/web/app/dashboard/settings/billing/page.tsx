"use client";

import { useState } from "react";
import { useSubscription } from "@/hooks/use-billing";
import { useCancelScheduled } from "@/hooks/use-cancel-scheduled";
import { Button } from "@/components/ui/button";
import { CancelScheduledDialog } from "@/components/billing/cancel-scheduled-dialog";
import { CurrentPlanBanner } from "@/components/billing/current-plan-banner";
import { useApi } from "@/hooks/use-api";
import { useQuery } from "@tanstack/react-query";

export default function DashboardBillingSettingsPage() {
  const { data, isLoading } = useSubscription();
  const [portalLoading, setPortalLoading] = useState(false);
  const api = useApi();

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const result = await api.openCustomerPortal();
      if ("url" in result) {
        window.open(result.url, "_blank");
      }
    } catch {}
    setPortalLoading(false);
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <p className="text-[color:var(--ink-muted)]">Loading subscription…</p>
      </div>
    );
  }

  const sub = data?.subscription;
  const plan = data?.plan;
  const usage = data?.usage;
  const isFree = sub?.planKey === "free";
  const isCanceled = sub?.cancelAtPeriodEnd;
  const isOnHold = sub?.status === "ON_HOLD";
  const paymentFailed = sub?.paymentFailedAt;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-medium text-[color:var(--ink)]">Billing</h1>

      {paymentFailed && <CurrentPlanBanner />}

      <div className="mt-6 space-y-6">
        <section className="rounded-xl border border-[color:var(--line)] bg-[color:var(--surface)] p-6">
          <h2 className="text-lg font-medium text-[color:var(--ink)]">
            {plan?.name ?? "Free"} Plan
          </h2>
          <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
            {isFree
              ? "You're on the free plan. Upgrade to unlock more uploads."
              : isCanceled
                ? "Your subscription will cancel at the end of the billing period."
                : `$${plan?.priceUsd ?? 0}/mo`}
          </p>

          {usage && (
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[color:var(--ink-muted)]">Videos used this period</p>
                <p className="mt-1 font-mono text-lg text-[color:var(--ink)]">
                  {usage.videosUsed} / {usage.videosAllowed}
                </p>
              </div>
              <div>
                <p className="text-xs text-[color:var(--ink-muted)]">Thumbnails used</p>
                <p className="mt-1 font-mono text-lg text-[color:var(--ink)]">
                  {usage.thumbnailsUsed} / {usage.thumbnailsAllowed}
                </p>
              </div>
            </div>
          )}

          {isOnHold && (
            <p className="mt-3 text-sm text-amber-600">
              Your subscription is on hold. Update your payment method to continue.
            </p>
          )}
        </section>

        <div className="flex gap-3">
          {!isFree && (
            <Button
              variant="outline"
              onClick={handleManageSubscription}
              disabled={portalLoading}
            >
              {portalLoading ? "Loading…" : "Manage subscription"}
            </Button>
          )}
          {!isFree && sub?.status === "ACTIVE" && (
            <CancelScheduledDialog planName={plan?.name} periodEnd={sub?.currentPeriodEnd} />
          )}
        </div>
      </div>
    </div>
  );
}