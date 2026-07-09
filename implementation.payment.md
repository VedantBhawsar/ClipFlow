# ClipFlow — Dodo Payments Implementation Plan (India Region)

> **Plan filename convention note:** this plan is generated as the OpenWolf plan file at `/Users/vedant/.claude/plans/i-want-you-to-expressive-quail.md`. The implementing agent's **first action** must be to copy this plan verbatim into `implementation.payment.md` at the repo root (`/Users/vedant/Documents/projects/ClipFlow/implementation.payment.md`) so the rest of the agentic pipeline can pick it up from there. After that copy, this OpenWolf plan file becomes the audit trail.

## 0. Quick orientation for the implementing agent

- **Project:** ClipFlow — Turborepo + pnpm. Three deployables today: `apps/web` (Next.js 16 + NextAuth v5), `apps/api` (Express 4 + TS, NOT NestJS), `apps/worker` (BullMQ). Shared packages in `packages/{db,config,types,crypto,s3,youtube-upload,eslint-config,typescript-config,ui}`. **Read `CLAUDE.md` first**, then `.wolf/OPENWOLF.md`, then `.wolf/cerebrum.md → Do-Not-Repeat` (2026-07-07 bullets on Dodo SDK mocking, on the env validation contract, on cache invalidation patterns, on Express Layer-prototype patch are all live and load-bearing).
- **Status:** Billing slice is not built. There is no `Plan`, no `Subscription`, no `WebhookEvent`, no `dodoProductId` anywhere in the codebase. The pricing config (`apps/web/lib/marketing/pricing.ts`) has a TODO comment ("Stable id; references the underlying billing record once Dodo is wired"). All three marketing CTAs currently point to `/signup` with label "Start free".
- **Hard rules (from existing code):**
  1. **Throw `AppError`, never raw `Error`** from services (`apps/api/src/errors/AppError.ts`). Central handler in `apps/api/src/middleware/error.ts` maps `ZodError→400`, `AppError→declared status`, unknown→500 with `requestId`.
  2. **Validate at the edge with zod** (`apps/api/src/middleware/validate.ts`). Bodies parsed into `req.body`, schemas in `modules/<feature>/<feature>.schemas.ts`.
  3. **DTO mapping** in `modules/<feature>/<feature>.types.ts` (e.g. `toPlanDto`, `toSubscriptionDto`). Never leak Prisma types past the service layer.
  4. **Env validation is the source of truth** — every new var goes into `packages/config/src/index.ts`. Fail fast at boot. **Do not** inline env reads in app code.
  5. **Cache invalidation on writes** — follow the existing `cache.del(\`me:${userId}\`)` pattern from auth/onboarding (the videos module uses `pendingUpload:<id>` keys instead; same `cache.del` shape works).
  6. **Import order in `apps/api/src/app.ts` is load-bearing** — `import express` first, `import "./lib/async-handler.js"` second (Layer.prototype monkey-patch). The new `express.raw()` mount for the webhook route must be added **after** the async-handler import and **before** the global `express.json()` parser, otherwise the raw-body signature verification breaks (the JSON parser would consume the body before the raw handler can read it).
  7. **Idempotency on webhooks is mandatory** (per TechSpec §6). The `WebhookEvent` table arrives with this slice. Use `INSERT … ON CONFLICT DO NOTHING RETURNING id` — no row returned means duplicate, ack 200 immediately, no side effects.
  8. **`Auth.js v5` middleware** in `apps/web/middleware.ts` exports `NextAuth(authConfig).auth as NextMiddleware` (do NOT invoke it eagerly — bug-2026-07-01 in cerebrum). The `as NextMiddleware` cast is required because the inferred type references private `next-auth/lib` subpaths.

## 1. Context

ClipFlow's marketing surface promises three paid tiers (Starter $15 / Creator $35 / Pro $69) but today every CTA just routes to `/signup`. There is no `Plan`, no `Subscription`, no `WebhookEvent`, no usage-limit guard anywhere in the codebase. The schema file even has an explicit comment listing billing tables as "intentionally omitted" until their slice ships.

**Success =** a creator signs up → free tier auto-provisions → they can upload 1 video → clicking Starter on `/billing` opens a Dodo test-mode checkout in INR/UPI/card → the webhook flips their `Subscription` to ACTIVE → the next upload respects `videosPerMonth = 5` → exceeding the limit returns 403 `PLAN_LIMIT_REACHED` with the upgrade CTA.

**Non-goals for this slice:** annual pricing, promo/discount codes, refunds UI, Dodo customer-portal customisation, v1.5 billing analytics, GST-line-itemised invoices (Dodo issues whatever it issues), tax-ID collection beyond what the hosted checkout surfaces.

## 2. Decisions to lock in upfront

- **Currency model: keep USD-priced products on Dodo; allow `billing_currency: 'INR'` as an optional checkout parameter.** Adding parallel INR-priced products in Dodo means managing 3×2 SKUs and a 2-column pricing page. INR display in the hosted checkout already works when `billing_currency` is set on the session, so we ship USD products first and revisit localised pricing once Dodo confirms India is GA.
- **Usage-limit fires at `createVideo`, not `finalizeUpload`.** Faster feedback (no presigned URL minted for an over-limit user, no wasted cache entry). Implemented as `assertWithinVideoLimit(userId)` helper in `apps/api/src/lib/plan-guard.ts`.
- **Free tier exists: `videosPerMonth: 1`, `thumbnailsPerVideo: 1`.** Auto-provisioned lazily on first call to `GET /api/billing/subscription` or on first `createVideo`. Idempotent `upsert`.
- **Plan-Dodo mapping: `Plan` rows seeded at boot from env (`DODO_STARTER_PRODUCT_ID` etc.).** If env is unset, a placeholder product id is stored so the row exists for dev; checkout will 503 with a clear error until real ids are configured. A `scripts/seed-products.ts` is provided for one-off prod seeding.
- **Webhook idempotency: `INSERT … ON CONFLICT (event_id) DO NOTHING RETURNING id`** — no row returned ⇒ duplicate ⇒ ack 200 immediately. Wrap the actual handler in a `pg_advisory_xact_lock(hashtext(event_id))` to serialise two simultaneous retries. On any uncaught exception inside the handler body, ack 500 so Dodo retries.
- **Mount order for the webhook route:** `app.use("/api/billing/webhooks", express.raw({...}), buildBillingWebhookRouter(env))` BEFORE `app.use(express.json(...))`. The webhook handler needs the raw bytes for HMAC verification; the JSON parser would consume them otherwise.

## 3. Database changes

**File:** `packages/db/schema.prisma`. Append after the existing `ChannelThumbnailStyle` block.

**Migration filename:** `20260709000000_add_billing_tables`

```prisma
// ---------- Billing ----------

enum SubscriptionStatus {
  /// Active and paid — uploads allowed up to plan limit.
  ACTIVE
  /// Paid but the period ended with no successful renewal (e.g. card
  /// declined). Dodo will retry; we block new uploads but keep read
  /// access so the creator can fix payment.
  ON_HOLD
  /// User cancelled at period end — access continues until
  /// `currentPeriodEnd`.
  CANCELED
  /// Plan/product deleted at the source; treated like CANCELED for
  /// access.
  EXPIRED
}

enum PlanInterval {
  MONTH
  YEAR
}

/// Billing plan as sold by Dodo. `dodoProductId` is the foreign key
/// back into Dodo's product catalogue; webhooks carry the product_id
/// that we resolve back to one of these rows. `key` is the stable id
/// (`starter` / `creator` / `pro` / `free`) referenced everywhere in
/// our own code and UI; renaming the marketing display name should
/// never touch this column.
model Plan {
  id          String      @id @default(cuid())
  key         String      @unique
  name        String
  /// Monthly USD price (whole dollars). 0 for the free plan.
  priceUsd    Int
  videosPerMonth      Int
  thumbnailsPerVideo  Int
  interval    PlanInterval @default(MONTH)

  /// Foreign key into Dodo Payments. Free plan has no Dodo product;
  /// `dodoProductId` is null in that row.
  dodoProductId String? @unique

  /// Marketing flags — read by the web pricing card, not enforced
  /// anywhere on the server.
  isHighlighted Boolean @default(false)
  sortOrder     Int     @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  subscriptions Subscription[]

  @@map("plans")
}

/// One row per user. Created lazily on first access to
/// `/api/billing/subscription` or first `createVideo` — free plan
/// only at provisioning time; paid plans only land here via webhook
/// (checkout itself never inserts). Dodo is the source of truth for
/// `currentPeriodStart` / `currentPeriodEnd`; we mirror them so the
/// server can decide access without an API call.
model Subscription {
  id     String @id @default(cuid())
  userId String @unique
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  planId String
  plan   Plan   @relation(fields: [planId], references: [id])

  status SubscriptionStatus @default(ACTIVE)

  /// Null for the free plan and for any paid subscription where Dodo
  /// hasn't reported back yet (e.g. checkout started but webhook
  /// delayed). The service layer treats null as "not yet active".
  dodoSubscriptionId String? @unique
  dodoCustomerId     String?

  currentPeriodStart DateTime?
  currentPeriodEnd   DateTime?
  cancelAtPeriodEnd  Boolean   @default(false)

  /// Reset on period rollover (handled in the webhook handler) and on
  /// upgrades. Compared against `plan.videosPerMonth` in
  /// `assertWithinVideoLimit`.
  videosUsedThisPeriod Int @default(0)
  thumbnailsUsedThisPeriod Int @default(0)

  /// Set when Dodo reports `payment.failed`; cleared on next
  /// `subscription.active` or `subscription.renewed`. Service layer
  /// reads this to surface a banner.
  paymentFailedAt DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([planId])
  @@index([status])
  @@index([currentPeriodEnd])
  @@map("subscriptions")
}

/// Webhook idempotency table — one row per Dodo event we've ever
/// seen. Insert-first pattern (handler inserts BEFORE doing the
/// side-effect work; conflict on `eventId` short-circuits). `payload`
/// is stored verbatim so support can replay a payload against a
/// staging API for debugging.
model WebhookEvent {
  id        String   @id @default(cuid())
  provider  String   // always "dodo" for now
  eventId   String   // Dodo's `webhook-id` header
  eventType String   // e.g. "subscription.active"
  payload   Json
  /// Set when the handler completes successfully. NULL means the
  /// handler started but didn't finish (will retry on next delivery).
  processedAt DateTime?
  attempts   Int     @default(1)
  lastError  String?

  receivedAt DateTime @default(now())

  @@unique([provider, eventId])
  @@index([provider, receivedAt])
  @@map("webhook_events")
}
```

Plus the `User` back-relation (in the existing `User` block):
```prisma
  subscription      Subscription?
```
And add `Subscription` to the `User` relations list at the top.

## 4. Env additions

**File:** `packages/config/src/index.ts`. Add to `envSchema` (after the `RATE_LIMIT_*` block):

```ts
  // ---- Dodo Payments ----
  /// Server-side bearer token from the Dodo dashboard. Never exposed
  /// to the browser.
  DODO_PAYMENTS_API_KEY: z.string().min(20),
  /// Webhook signing secret — separate from the API key. Rotate via
  /// the Dodo dashboard; old events still verify for the grace period.
  DODO_PAYMENTS_WEBHOOK_SECRET: z.string().min(20),
  /// `test_mode` keys allow test cards and never charge. Switch to
  /// `live_mode` only after Dodo confirms India-region GA.
  DODO_PAYMENTS_ENVIRONMENT: z.enum(["test_mode", "live_mode"]).default("test_mode"),

  /// Dodo product ids, one per paid tier. Created in the Dodo
  /// dashboard (or via `client.products.create` — see
  /// `apps/api/src/modules/billing/scripts/seed-products.ts`). The
  /// seed migration reads these into the `Plan` rows.
  DODO_STARTER_PRODUCT_ID: z.string().regex(/^pdt_/).optional(),
  DODO_CREATOR_PRODUCT_ID: z.string().regex(/^pdt_/).optional(),
  DODO_PRO_PRODUCT_ID: z.string().regex(/^pdt_/).optional(),

  /// Dodo product id for the free "plan". Optional because the free
  /// plan has no Dodo product at all — the row is seeded with
  /// `dodoProductId = null`. Set this if/when we give the free plan a
  /// SKU for unified reporting.
  DODO_FREE_PRODUCT_ID: z.string().regex(/^pdt_/).optional(),

  /// Web origin used to build `return_url` / `cancel_url` for
  /// checkout sessions. Defaults to `WEB_ORIGIN`.
  APP_URL: z.string().url().optional(),
```

Add a derived helper at the bottom of `loadEnv`:
```ts
export const resolveAppUrl = (env: Env): string => env.APP_URL ?? env.WEB_ORIGIN;
```

`loadPublicEnv` gets nothing — billing vars stay server-side.

## 5. API surface

All under `/api/billing`. Mounted in `apps/api/src/app.ts` between `settings` and `youtube`.

| Method | Path | Auth | Body / Query | Response | Error codes |
|---|---|---|---|---|---|
| GET | `/api/billing/plans` | none | — | `Plan[]` (id, key, name, priceUsd, videosPerMonth, thumbnailsPerVideo, highlighted, sortOrder) | — |
| GET | `/api/billing/subscription` | required | — | `{ plan: Plan, subscription: SubscriptionDto, usage: { videosUsed, videosAllowed, thumbnailsUsed, thumbnailsAllowed, periodEnd } }` | 401, 503 DB_UNAVAILABLE |
| POST | `/api/billing/checkout` | required | `{ planId: 'starter'\|'creator'\|'pro', country?: 'IN', billingCurrency?: 'INR'\|'USD' }` | `{ checkoutUrl, sessionId }` | 400 INVALID_PLAN, 409 ALREADY_SUBSCRIBED, 502 DODO_CHECKOUT_FAILED |
| POST | `/api/billing/customer-portal` | required | — | `{ url }` (Dodo-hosted portal) OR `{ available: false }` with 501 if Dodo portal is not enabled in the test environment | 501 PORTAL_UNAVAILABLE |
| POST | `/api/billing/cancel-scheduled` | required | — | `{ cancelAtPeriodEnd: true, periodEnd }` | 409 NO_ACTIVE_SUBSCRIPTION, 502 DODO_CANCEL_FAILED |
| POST | `/api/billing/webhooks/dodo` | **none** (signature-verified) | raw body | `{ received: true }` | 400 INVALID_SIGNATURE, 401 SIGNATURE_EXPIRED |

`SubscriptionDto`: `{ id, planKey, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, videosUsedThisPeriod, thumbnailsUsedThisPeriod, paymentFailedAt }`.

The webhook route is mounted with `express.raw({ type: '*/*', limit: '1mb' })` BEFORE the global JSON parser — see `app.ts` change in §6.

## 6. Module layout

**New files** under `apps/api/src/modules/billing/`:

- `client.ts` — singleton wrapper around `new DodoPayments({ bearerToken: env.DODO_PAYMENTS_API_KEY, environment: env.DODO_PAYMENTS_ENVIRONMENT })`. Exposes typed helpers:
  - `createCheckoutSession(input)` — wraps `client.checkoutSessions.create(...)` with India-friendly defaults (`billing_address.country='IN'` when not provided, `allowed_payment_method_types: ['upi','card']`).
  - `cancelSubscription(dodoSubscriptionId)` — wraps `client.subscriptions.update(...)` or `.cancel(...)` per current SDK shape (verify exact method name against installed SDK version at implementation time).
  - `getCustomerPortalUrl(dodoCustomerId)` — returns null if Dodo portal not enabled in this env.
  - `verifyWebhookSignature(rawBody, signatureHeader, timestamp)` — constant-time HMAC SHA256 compare, format `v1,<base64>` per Dodo's docs.
  - Reads `client.misc.listSupportedCountries()` once at boot; logs a `WARN` and exposes `billingClient.countrySupported('IN')` if `'IN'` is absent.
- `schemas.ts` — zod bodies: `createCheckoutSchema`, `cancelScheduledSchema`. Param schemas for plan-id URLs.
- `types.ts` — `PlanDto`, `SubscriptionDto`, `UsageDto`, DTO mappers `toPlanDto`, `toSubscriptionDto`, `toUsageDto`.
- `service.ts` — `listPlans()`, `getSubscription(userId)` (lazy-provisions free on miss), `createCheckout(userId, planId, opts)`, `cancelScheduled(userId)`, `openCustomerPortal(userId)`, `handleWebhookEvent(event)`.
- `controller.ts` — thin HTTP adapters; uses `sendOk/sendCreated` from `apps/api/src/lib/response.ts`.
- `routes.ts` — `buildBillingRouter(env)`, exports `billingWebhookRouter` (raw-body-mounted variant).
- `__fixtures__/subscription-active.json`, `__fixtures__/subscription-renewed.json`, `__fixtures__/subscription-cancelled.json`, `__fixtures__/subscription-on-hold.json`, `__fixtures__/payment-failed.json`, `__fixtures__/refund-succeeded.json`, `__fixtures__/subscription-plan-changed.json` — sample webhook payloads for tests.
- `scripts/seed-products.ts` — one-off `dodopayments.products.create` for each tier; writes the resulting `pdt_…` ids back to `.env` (developer runs this; not invoked at boot).
- `seed.ts` — at-migration seed; inserts the four `Plan` rows using env-driven `dodoProductId`s. Called from `packages/db/prisma/seed.ts` (extend existing) or directly invoked by `migrate.mjs`.

**Modified files:**

- `apps/api/src/app.ts` — add `app.use("/api/billing/webhooks", express.raw({ type: "*/*", limit: "1mb" }), buildBillingWebhookRouter(env))` BEFORE `app.use(express.json(...))`; add `app.use("/api/billing", express.json(...), buildBillingRouter(env))` next to the other routers. **Load-bearing: the async-handler side-effect import must remain on line 2.**
- `apps/api/src/index.ts` — boot banner gains `"Billing: ✓ Dodo Payments (test_mode) live IN support"` once `client.misc.listSupportedCountries()` resolves. If `'IN'` is absent, log `WARN: 'IN' not in Dodo's supported countries list — checkout will 502 until Dodo confirms India GA`.
- `apps/api/src/lib/prisma.ts` — no change (Prisma 7 regenerates types from the new schema).
- `apps/api/src/modules/videos/videos.service.ts` — wire `assertWithinVideoLimit(userId)` into `createVideo` BEFORE the presigned URL mint. Increment `videosUsedThisPeriod` inside `finalizeUpload` after the `Video` row is committed.
- `packages/db/prisma/migrations/20260709000000_add_billing_tables/migration.sql` — auto-generated by `prisma migrate dev`.
- `packages/db/schema.prisma` — schema additions from §3.

## 7. Usage-limit enforcement

**Helper:** `apps/api/src/lib/plan-guard.ts`.

```ts
import { prisma } from "./prisma.js";
import { requireDatabase } from "./db-guard.js";
import { AppError } from "../errors/AppError.js";

export type EffectiveAccess = {
  canUpload: boolean;
  reason?: "PLAN_LIMIT_REACHED" | "SUBSCRIPTION_INACTIVE" | "SUBSCRIPTION_EXPIRED";
  planKey: string;
  videosAllowed: number;
  videosUsed: number;
};

export const evaluateUploadAccess = async (userId: string): Promise<EffectiveAccess> => {
  requireDatabase();
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    include: { plan: true },
  });
  // Default to the free plan when no subscription row exists yet —
  // mirrors the lazy-provision contract.
  const plan = sub?.plan ?? (await getFreePlan());
  const now = new Date();
  const active = sub && (sub.status === "ACTIVE" || (sub.status === "CANCELED" && sub.currentPeriodEnd && sub.currentPeriodEnd > now));
  if (!active) {
    return { canUpload: false, reason: "SUBSCRIPTION_INACTIVE", planKey: plan.key, videosAllowed: plan.videosPerMonth, videosUsed: sub?.videosUsedThisPeriod ?? 0 };
  }
  if (sub.videosUsedThisPeriod >= plan.videosPerMonth) {
    return { canUpload: false, reason: "PLAN_LIMIT_REACHED", planKey: plan.key, videosAllowed: plan.videosPerMonth, videosUsed: sub.videosUsedThisPeriod };
  }
  return { canUpload: true, planKey: plan.key, videosAllowed: plan.videosPerMonth, videosUsed: sub.videosUsedThisPeriod };
};

export const assertWithinVideoLimit = async (userId: string): Promise<void> => {
  const access = await evaluateUploadAccess(userId);
  if (!access.canUpload) {
    if (access.reason === "PLAN_LIMIT_REACHED") {
      throw new AppError(403, "PLAN_LIMIT_REACHED",
        `You've used all ${access.videosAllowed} videos for this period. Upgrade your plan to continue.`,
        { planId: access.planKey, currentTier: access.planKey, videosUsed: access.videosUsed, videosAllowed: access.videosAllowed });
    }
    if (access.reason === "SUBSCRIPTION_INACTIVE") {
      throw new AppError(402, "SUBSCRIPTION_INACTIVE",
        "Your subscription is not active. Update your payment method to continue uploading.");
    }
    throw new AppError(403, "SUBSCRIPTION_EXPIRED", "Your subscription has expired.");
  }
};
```

**Wire-in point:** `apps/api/src/modules/videos/videos.service.ts → createVideo`, immediately after `requireDatabase()` and BEFORE `requireConnectedChannel` (cheap check first). On success, increment `videosUsedThisPeriod` inside `finalizeUpload` after the `Video` row is committed (so an upload that crashes mid-PUT doesn't count).

**Cache:** introduce `apps/api/src/lib/plan-cache.ts` mirroring the `cache` helper: `getCachedAccess(userId)` reads `access:${userId}` with a 30s TTL; `invalidateAccess(userId)` is called from every webhook handler that mutates subscription state. Plan-guard calls the cached version; the webhook path invalidates.

## 8. Webhook handler

Exact flow inside `billingWebhookRouter` (mounted with `express.raw`):

1. Read `webhook-signature` (format `v1,<base64>`), `webhook-id`, `webhook-timestamp`. Reject 400 if any missing.
2. Reject 401 if `|now - timestamp| > 5 * 60 * 1000`.
3. `client.verifyWebhookSignature(rawBody, signatureHeader, timestamp)` — constant-time compare.
4. `INSERT INTO webhook_events (provider, event_id, event_type, payload) VALUES ('dodo', $1, $2, $3) ON CONFLICT (provider, event_id) DO NOTHING RETURNING id` — wrap in a single transaction with `SELECT pg_advisory_xact_lock(hashtext($1))`. If no row returned, ack 200 immediately.
5. Inside the same transaction, dispatch on `event.type`:

| Event type | Action |
|---|---|
| `subscription.active` | Upsert `Subscription` by `dodoSubscriptionId`; resolve `planId` via `Plan.dodoProductId === event.data.product_id` (fallback to free plan + log warn if mismatch). Set `status=ACTIVE`, `currentPeriodStart`/`currentPeriodEnd` from `period_start`/`period_end` (Dodo's `next_billing_date` if absent), reset `videosUsedThisPeriod = 0`, clear `paymentFailedAt`. |
| `subscription.renewed` | Same as active but compute period delta from old `currentPeriodEnd`; if the new period moved past old end, reset usage counters; otherwise preserve (defensive against Dodo firing `renewed` mid-period). |
| `subscription.plan_changed` | Update `planId`, reset `videosUsedThisPeriod = 0` only when the new plan is a higher tier (compare `priceUsd`). |
| `subscription.on_hold` | Set `status=ON_HOLD`. Plan-guard will treat this as `SUBSCRIPTION_INACTIVE`. |
| `subscription.cancelled` | Set `status=CANCELED`, `cancelAtPeriodEnd=true`. Service-layer check keeps access until `currentPeriodEnd > now`. |
| `payment.failed` | Set `paymentFailedAt = now()`. No `status` change (Dodo manages the ON_HOLD transition on `subscription.on_hold`). Log via logger; webhook_events is the audit trail. |
| `refund.succeeded` | Set `status=CANCELED`, `cancelAtPeriodEnd=true`, `currentPeriodEnd=now()`. Immediate revoke. |
| anything else | Log warn, mark `processedAt`. |

6. Set `webhook_events.processedAt = now()` in the same transaction.
7. On uncaught exception: return 500 (NOT 200). Dodo retries 4xx/5xx; we want a retry on a partial failure. Successful duplicate handling (no row returned in step 4) always returns 200.
8. Always invalidate `cache.del(\`access:${userId}\`)` after a commit.

## 9. Web changes

**Modify:**

- `apps/web/lib/marketing/pricing.ts` — keep USD prices; add a `CHECKOUT_HREF` map:
  ```ts
  export const CHECKOUT_HREFS: Record<PricingPlanId, string> = {
    starter: "/billing?plan=starter",
    creator: "/billing?plan=creator",
    pro:    "/billing?plan=pro",
  };
  ```
  Replace the `pricing.ts` TODO comment with: `"Mapped 1:1 to Plan rows; see /api/billing/plans."`
- `apps/web/components/marketing/PricingSection.tsx` — change CTA from `<Link href="/signup">` to `<Link href={CHECKOUT_HREFS[plan.id]}>`. If user is unauthenticated, the `/billing` page redirects to `/signup?next=/billing?plan=X` (handled inside the page).
- `apps/web/auth.config.ts` — `session` callback adds `planKey: subscription?.plan.key ?? 'free'` (read from cached `/api/billing/subscription` call inside the `jwt` callback). Cheap enough for the dashboard guard. Update the `AuthToken` interface accordingly.
- `apps/web/lib/api-client.ts` — add methods (using the existing `ApiClient` interface and `request()` helper):
  ```ts
  getPlans(): Promise<Plan[]>;
  getSubscription(): Promise<{ plan: Plan; subscription: SubscriptionDto; usage: UsageDto }>;
  createCheckoutSession(body: { planId: 'starter'|'creator'|'pro'; country?: 'IN'; billingCurrency?: 'INR'|'USD' }): Promise<{ checkoutUrl: string; sessionId: string }>;
  openCustomerPortal(): Promise<{ url: string } | { available: false }>;
  cancelScheduled(): Promise<SubscriptionDto>;
  ```
  Reuse the existing `ApiError` thrown-by-`request()` pattern (see `api-client.ts:177` — already throws `new ApiError(status, code, message, details)` for non-2xx + `SessionExpiredError` on 401).
- `apps/web/hooks/use-api.ts` — no change to the hook itself; the new `api.*` methods are reachable through it.

**New files:**

- `apps/web/app/billing/page.tsx` — client component; reads `?plan=` from `useSearchParams`; calls `api.getSubscription()` + `api.getPlans()`; renders a 3-card layout reusing `PRICING_PLANS`; "Current plan" badge on the active row; "Upgrade" button → `useCheckout()` → `window.location.href = checkoutUrl`. If `useSession()` returns null, `router.replace('/signup?next=' + currentPath)`.
- `apps/web/app/billing/success/page.tsx` — reads `session_id` from `useSearchParams`; `useEffect` polls `api.getSubscription()` every 2 s, max 30 s, until `status === 'ACTIVE'`; shows "Welcome to <plan>" + dashboard CTA. If still `PENDING` after 30 s, show "Payment received — refresh in a moment" with a manual `api.getSubscription()` button.
- `apps/web/app/billing/return/page.tsx` — fallback redirect target (in case `return_url` is configured wrong). Redirects to `/billing`.
- `apps/web/app/dashboard/settings/billing/page.tsx` — current-plan summary card, "Manage subscription" button → `api.openCustomerPortal()`; "Cancel subscription" → `<CancelScheduledDialog/>`; "Payment failed" banner when `paymentFailedAt` is recent.
- `apps/web/hooks/use-billing.ts` — TanStack Query: `useSubscription()`, `usePlans()` with keys `["billing","subscription"]`, `["billing","plans"]`. `staleTime: 60_000`. Invalidate both on a successful `useCheckout()` mutation.
- `apps/web/hooks/use-checkout.ts` — `useCreateCheckout()` mutation; on success `window.location.href = data.checkoutUrl`.
- `apps/web/hooks/use-cancel-scheduled.ts` — `useCancelScheduled()` mutation; on success invalidate `["billing","subscription"]`.
- `apps/web/components/billing/plan-card.tsx` — accepts `{ plan, current, onSelect }`; renders "Current plan" / "Upgrade" CTA. Reuses the marketing pricing-card visual idiom.
- `apps/web/components/billing/current-plan-banner.tsx` — for dashboard chrome; reads from `useSubscription()`, surfaces `paymentFailedAt`.
- `apps/web/components/billing/cancel-scheduled-dialog.tsx` — shadcn `<Dialog>` wrapping `useCancelScheduled()`. Body: "Your subscription stays active until <currentPeriodEnd>. You can re-enable anytime from this page."

## 10. Free-tier behavior

Lazy provisioning in `billing.service.ts → getSubscription`:

```ts
const FREE_PLAN_KEY = "free";
const ensureSubscription = async (userId: string) => {
  const existing = await prisma.subscription.findUnique({ where: { userId }, include: { plan: true } });
  if (existing) return existing;
  const freePlan = await prisma.plan.findUnique({ where: { key: FREE_PLAN_KEY } });
  if (!freePlan) throw new AppError(500, "BILLING_NOT_SEEDED", "Free plan row missing.");
  return prisma.subscription.create({
    data: { userId, planId: freePlan.id, status: "ACTIVE", videosUsedThisPeriod: 0 },
    include: { plan: true },
  });
};
```

Called from `getSubscription`, `createCheckout` (to verify `videosUsedThisPeriod` for the upgrade prompt copy), and `createVideo` (so the counter increments even before the user visits `/billing`).

Seed: a one-shot migration-time seed inside `packages/db/prisma/seed.ts` (extend the existing seed if present; create if absent) inserts the four `Plan` rows using env-driven `dodoProductId`s. Run via `pnpm --filter @clipflow/db prisma:seed` post-migrate.

## 11. Documentation deliverable

The implementing agent writes its progress into `implementation.payment.md` (which IS this plan, copied to the repo root). After implementation lands:

- `docs/Schema.md` — append `Plan`, `Subscription`, `WebhookEvent` tables and their relations.
- `docs/PRD.md` §8 / §11 — replace "Tier pricing" with a section pointing at `Plan` rows.
- `docs/TechSpec.md` — add a "Billing" subsection: Dodo webhook flow, signature verification, idempotency contract.
- `docs/AppFlow.md` "Billing flow" — new section: signup → free → upgrade → checkout → webhook → access.
- `apps/web/lib/marketing/pricing.ts` comment block — replace the TODO with: `"Mapped 1:1 to Plan rows; see /api/billing/plans."`

## 12. Test plan

| Layer | File | Cases |
|---|---|---|
| Schema | `packages/db/prisma/migrations/20260709000000_add_billing_tables/migration.sql` (auto-generated) | `pnpm --filter @clipflow/db prisma migrate dev` runs cleanly on a fresh DB and on top of existing dev DB |
| Unit | `apps/api/src/modules/billing/billing.client.test.ts` | `verifyWebhookSignature` happy path, tampered body → false, stale timestamp → 400; `createCheckoutSession` factory under `vi.mock('dodopayments')` returns a fake `checkout_url`. **Follow the cerebrum 2026-07-07 guidance on Dodo SDK mocking** — declare the mock factory as a real ES `class` with the methods/fields the consumer touches, capture the constructor opts, and `vi.fn()` only the inner behaviour. Use `vi.hoisted` for all mock declarations. |
| Unit | `apps/api/src/modules/billing/billing.schemas.test.ts` | `createCheckoutSchema` rejects `planId: 'free'` (must be paid tier), rejects unknown `planId`; allows `billingCurrency: 'INR'` and `'USD'`; rejects missing `country` when `billingCurrency='INR'` is set. |
| Service | `apps/api/src/modules/billing/billing.service.test.ts` | `getSubscription` lazy-provisions free when no row; `createCheckout` returns `checkoutUrl` from fake client and persists NO `Subscription` row (webhook does that); `cancelScheduled` 409 when subscription is free / not active. |
| Guard | `apps/api/src/lib/plan-guard.test.ts` | `videosUsed=4, plan.videosPerMonth=5` → ok; `5/5` → throws `PLAN_LIMIT_REACHED`; `6/5` → throws; null subscription → free plan limit (1); CANCELED + `currentPeriodEnd < now` → throws `SUBSCRIPTION_EXPIRED`; CANCELED + `currentPeriodEnd > now` → ok; ON_HOLD → throws `SUBSCRIPTION_INACTIVE`. |
| Routes | `apps/api/src/modules/billing/billing.routes.test.ts` (supertest on `createApp`) | 401 unauthenticated on `GET /subscription`; 200 with DTO when authed; 400 on bad `planId`; signature-fail on `/webhooks/dodo` → 401; stale timestamp → 401; duplicate event-id → 200 with no second row written; missing `webhook-signature` header → 400. |
| Webhook | `apps/api/src/modules/billing/webhook.test.ts` | Loads each `__fixtures__/*.json`; asserts the right `Subscription` mutation; asserts `videosUsedThisPeriod = 0` after `subscription.active`; second identical delivery → still 200, no second mutation; tampered payload → 401 before insert. |
| Integration | `apps/api/src/modules/videos/videos.service.test.ts` (extend existing) | `createVideo` rejects with `PLAN_LIMIT_REACHED` when `videosUsedThisPeriod === plan.videosPerMonth`; `finalizeUpload` increments `videosUsedThisPeriod` by 1; cache invalidates on access update. **Watch the cerebrum 2026-07-01 reminder** — adding nullable columns to a model with a hand-rolled `StubVideo` / `mockVideo` test alias may break `tsc --noEmit`; add matching nullable fields to the alias and every inline row literal. |
| Web | `apps/web/lib/api-client.test.ts` (extend) | `createCheckoutSession` returns `{ checkoutUrl }`; `getSubscription` DTO round-trip; `ApiError.code === 'PLAN_LIMIT_REACHED'` flows through. |
| Web | `apps/web/components/billing/plan-card.test.tsx` | Renders "Current plan" badge when `current === plan.id`; CTA calls `onSelect`; uses real timers (no `vi.useFakeTimers` per cerebrum 2026-07-02). |
| Web | `apps/web/app/billing/success/page.test.tsx` | Polls until ACTIVE; renders dashboard CTA; manual-refresh fallback works after 30 s timeout. |

## 13. Verification (how the implementer proves it works end-to-end)

1. **Boot sanity:** `pnpm --filter api build && pnpm --filter api start` prints `Billing: ✓ Dodo Payments (test_mode) live IN support` (or `WARN: 'IN' not in Dodo's supported countries` if Dodo hasn't GA'd India yet — visible in logs).
2. **Local signup flow:** `curl -X POST localhost:4000/api/auth/register …` → `GET /api/billing/subscription` returns free plan; `videosAllowed: 1`.
3. **Upgrade flow:** `POST /api/billing/checkout { planId: "starter", country: "IN", billingCurrency: "INR" }` returns `{ checkoutUrl, sessionId }`; open `checkoutUrl` in browser, complete with Dodo test card → redirected to `/billing/success?session_id=…`; page polls; `subscription.status === "ACTIVE"`; `videosAllowed === 5`.
4. **Usage enforcement:** upload 5 videos; the 6th `POST /api/videos` returns `403 PLAN_LIMIT_REACHED` with details `{ planId: "starter", videosUsed: 5, videosAllowed: 5 }`.
5. **Webhook signature:** `curl -X POST localhost:4000/api/billing/webhooks/dodo -H 'webhook-signature: v1,bad' -d '{...}'` returns 401.
6. **Webhook idempotency:** POST a real `subscription.active` payload twice (same `webhook-id`); first call creates the row, second returns 200 with `webhook_events` showing two rows but one mutation.
7. **India region:** confirm the hosted checkout renders INR prices and shows UPI + card options. If `client.misc.listSupportedCountries()` does NOT include `'IN'`, the boot banner surfaces a WARN — abort and file with Dodo support before flipping `DODO_PAYMENTS_ENVIRONMENT=live_mode`.
8. **Tests:** `pnpm --filter api test:ci` and `pnpm --filter web test:ci` pass.
9. **Migration:** `pnpm --filter @clipflow/db prisma migrate dev --name add_billing_tables` creates a clean diff on top of the current schema.
10. **Cache invalidation:** after a webhook fires, `cache.del('access:<userId>')` is called — verify by reading the access log on a Redis PING probe (`pnpm --filter api dev` will print the banner).

## 14. Risks & open questions

- **(a) Dodo India GA unconfirmed.** The integration is test-mode-validated; do NOT flip `DODO_PAYMENTS_ENVIRONMENT=live_mode` until Dodo support confirms India-region processing. Add a follow-up issue to swap to INR-priced products once GA.
- **(b) Refunds are one-way.** No UI; refunds come from Dodo dashboard or support ticket, webhooks update `status=CANCELED`. This is acceptable for v1; revisit when refunds UX is in scope.
- **(c) Customer portal availability.** Dodo's portal is in private beta as of the docs read. The `/customer-portal` route returns `501 PORTAL_UNAVAILABLE` when absent, and the web falls back to in-app "Cancel subscription" → `cancel-scheduled` API.
- **(d) Session shape.** Adding `planKey` to the NextAuth session JWT increases cookie payload by ~30 bytes; acceptable. Alternative is a second `useBilling().subscription` fetch in the dashboard layout — slower. **Decision: extend `auth.config.ts → jwt` callback to call `api.getSubscription()` server-side and project `planKey` into the session token.**
- **(e) Pricing page CTA ambiguity.** When an unauthenticated user clicks "Upgrade" on the marketing page, they hit `/billing` → redirect to `/signup?next=/billing?plan=starter`. Confirm this flow with product before shipping.
- **(f) Dodo SDK method names.** The SDK exposes `client.subscriptions.cancel(...)`, `client.subscriptions.update(...)`, `client.subscriptions.retrieve(...)`. The exact method surface depends on the installed `dodopayments` version. The implementing agent should run `pnpm --filter api add dodopayments` and then `find node_modules/dodopayments -name "*.d.ts" -path "*/resources/subscriptions/*" | head` to confirm the precise call shape for `cancelSubscription`.
- **(g) Dodo `subscriptions.cancel` vs `subscriptions.update(cancel_at_next_billing_date=true)`.** Per Dodo docs, the cancel-scheduled pattern is `update({ id, cancel_at_next_billing_date: true })` (not the `.cancel()` method). Verify at install time.

## 15. Phase ordering

Each phase must pass tests before the next starts.

- **Phase 0 — Recon** (the planning agent's read pass; the implementing agent re-verifies): re-read `schema.prisma`, `pricing.ts`, `videos.service.ts → createVideo`, `auth.service.ts → register`, `app.ts`, `index.ts`. Confirm the assumptions still hold. Then copy this plan to `/Users/vedant/Documents/projects/ClipFlow/implementation.payment.md`.
- **Phase 1 — Schema + env.** Add the three Prisma models + enums + User back-relation. Run `pnpm --filter @clipflow/db prisma migrate dev --name add_billing_tables`. Add the env keys to `packages/config/src/index.ts`. No behavior change yet.
- **Phase 2 — SDK wrapper + schemas + DTOs.** `apps/api/src/modules/billing/{client,schemas,types}.ts`. No routes yet.
- **Phase 3 — Service + controller + routes + mount.** Implement `billing.service.ts`, `billing.controller.ts`, `billing.routes.ts`. Mount in `app.ts` (JSON mount only — webhook deferred to phase 5). Add boot-banner probe in `index.ts`.
- **Phase 4 — Plan guard + wire into `videos.service.ts`.** Create `apps/api/src/lib/plan-guard.ts` + `plan-cache.ts`. Call from `createVideo` (before presigning) and from `finalizeUpload` (after row commit, to increment).
- **Phase 5 — Webhook receiver.** Add `express.raw` mount in `app.ts`; implement `client.verifyWebhookSignature`; add `WebhookEvent` insert-and-dispatch flow per §8. Implement all six event handlers + `processedAt` write.
- **Phase 6 — Web typed client + hooks.** Extend `api-client.ts` with the new methods; add `use-billing.ts`, `use-checkout.ts`, `use-cancel-scheduled.ts`.
- **Phase 7 — Marketing CTA.** Update `pricing.ts` and `PricingSection.tsx`.
- **Phase 8 — Billing pages.** Build `/billing`, `/billing/success`, `/billing/return`, `/dashboard/settings/billing` + components.
- **Phase 9 — Tests.** Write every test file in §12. Run `pnpm test:ci` on both apps.
- **Phase 10 — Docs.** Update `docs/Schema.md`, `docs/PRD.md`, `docs/TechSpec.md`, `docs/AppFlow.md`, `pricing.ts` comment block to match what shipped. Append to `.wolf/memory.md` per OpenWolf protocol.

## 16. Critical files to modify (top 10)

| File | Why |
|---|---|
| `/Users/vedant/Documents/projects/ClipFlow/packages/db/schema.prisma` | Add `Plan`, `Subscription`, `WebhookEvent` models + enums + User back-relation (§3). |
| `/Users/vedant/Documents/projects/ClipFlow/packages/config/src/index.ts` | Add `DODO_PAYMENTS_*` + `APP_URL` env vars (§4). |
| `/Users/vedant/Documents/projects/ClipFlow/apps/api/src/app.ts` | Mount billing router + raw-body webhook mount BEFORE `express.json()` (§6). |
| `/Users/vedant/Documents/projects/ClipFlow/apps/api/src/modules/videos/videos.service.ts` | Wire `assertWithinVideoLimit(userId)` into `createVideo`; increment `videosUsedThisPeriod` in `finalizeUpload` (§7). |
| `/Users/vedant/Documents/projects/ClipFlow/apps/api/src/index.ts` | Boot-banner Dodo probe (§6). |
| `/Users/vedant/Documents/projects/ClipFlow/apps/api/src/modules/billing/{client,service,controller,routes,schemas,types}.ts` | New module (§6). |
| `/Users/vedant/Documents/projects/ClipFlow/apps/api/src/lib/plan-guard.ts` | New helper (§7). |
| `/Users/vedant/Documents/projects/ClipFlow/apps/web/lib/api-client.ts` | Add `getPlans`, `getSubscription`, `createCheckoutSession`, `openCustomerPortal`, `cancelScheduled` (§9). |
| `/Users/vedant/Documents/projects/ClipFlow/apps/web/lib/marketing/pricing.ts` | Add `CHECKOUT_HREFS`; replace TODO comment. |
| `/Users/vedant/Documents/projects/ClipFlow/apps/web/components/marketing/PricingSection.tsx` | Wire CTAs to `CHECKOUT_HREFS`. |

## 17. OpenWolf bookkeeping (per `.wolf/OPENWOLF.md`)

After implementation completes, the implementing agent must:

1. Append a one-line entry per significant action to `.wolf/memory.md` (the OpenWolf audit log).
2. Update `.wolf/anatomy.md` with the new files (`apps/api/src/modules/billing/*`, `apps/web/app/billing/*`, `apps/web/components/billing/*`, etc.).
3. Update `.wolf/cerebrum.md`:
   - **Key Learnings**: any new convention that wasn't obvious from the code (e.g. "Dodo SDK method names are stable across the v0.x line but `.cancel()` vs `.update(cancel_at_next_billing_date=true)` matters for the UX timing — use `.update` to keep access until period end").
   - **Do-Not-Repeat**: any mistake the agent makes and corrects (e.g. "Don't mount `express.raw` AFTER `express.json()` in `app.ts` — the JSON parser will consume the body before the signature handler can read it").
   - **Decision Log**: e.g. "[2026-07-XX] Currency model for India region: keep USD-priced products on Dodo, set `billing_currency: 'INR'` per checkout session, defer parallel INR products until Dodo confirms GA."
4. Log the Dodo wiring to `.wolf/buglog.json` with structure `{ id, timestamp, error_message: "billing slice shipped", file, root_cause: "n/a — slice shipped", fix: "see implementation.payment.md", tags: ["billing","dodo","india"], related_bugs: [], occurrences: 1, last_seen: <ISO> }` per the OpenWolf protocol.