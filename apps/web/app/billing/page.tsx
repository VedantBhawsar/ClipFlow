"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { usePlans, useSubscription } from "@/hooks/use-billing";
import { useCreateCheckout } from "@/hooks/use-checkout";
import { PlanCard } from "@/components/billing/plan-card";
import { PRICING_PLANS, type PricingPlanId } from "@/lib/marketing/pricing";
import type { PlanDto } from "@clipflow/types";


export const dynamic = 'force-dynamic'



function BillingPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const { data: plans, isLoading: plansLoading } = usePlans();
  const { data: subscription, isLoading: subLoading } = useSubscription();
  const checkoutMutation = useCreateCheckout();

  const [selectedPlan, setSelectedPlan] = useState<PricingPlanId | null>(
    (searchParams.get("plan") as PricingPlanId) ?? null,
  );

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      const currentPath = window.location.pathname + window.location.search;
      router.replace(`/signup?next=${encodeURIComponent(currentPath)}`);
    }
  }, [sessionStatus, router]);

  if (sessionStatus === "loading" || plansLoading || subLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-[color:var(--ink-muted)]">Loading…</p>
      </div>
    );
  }

  const currentPlanKey = subscription?.subscription.planKey;

  const handleSelect = async (planId: PricingPlanId) => {
    setSelectedPlan(planId);
    checkoutMutation.mutate({ planId });
  };

  return (
    <div className="mx-auto max-w-[1000px] px-5 py-16">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-medium text-[color:var(--ink)]">Choose your plan</h1>
        <p className="mt-2 text-[color:var(--ink-muted)]">
          {currentPlanKey && currentPlanKey !== "free"
            ? `You're currently on the ${currentPlanKey} plan.`
            : "Pick the plan that fits your upload cadence."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {plans?.map((plan: PlanDto) => {
          const marketingPlan = PRICING_PLANS.find((p) => p.id === plan.key);
          const isCurrent = currentPlanKey === plan.key;
          return (
            <PlanCard
              key={plan.key}
              plan={plan}
              marketingPlan={marketingPlan}
              current={isCurrent}
              onSelect={() => handleSelect(plan.key as PricingPlanId)}
              loading={checkoutMutation.isPending && selectedPlan === plan.key}
            />
          );
        })}
      </div>

      {checkoutMutation.isError && (
        <p className="mt-6 text-center text-sm text-red-500">
          {checkoutMutation.error?.message ?? "Something went wrong."}
        </p>
      )}
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><p className="text-[color:var(--ink-muted)]">Loading…</p></div>}>
      <BillingPageInner />
    </Suspense>
  );
}