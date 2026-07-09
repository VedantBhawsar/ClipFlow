"use client";

import { useSubscription } from "@/hooks/use-billing";

export function CurrentPlanBanner() {
  const { data } = useSubscription();

  if (!data?.subscription?.paymentFailedAt) return null;

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      A recent payment failed. Check your payment method to keep your subscription active.
    </div>
  );
}