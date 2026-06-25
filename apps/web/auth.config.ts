/**
 * Edge-safe NextAuth config.
 *
 * This file is imported by BOTH `middleware.ts` (Edge runtime) and
 * `auth.ts` (Node runtime). Anything Node-only — the Credentials
 * provider's `authorize`, bcrypt, the events.signOut fetch — lives in
 * `auth.ts`. Edge bundling fails on Node-only imports, so this file
 * is kept to: pages, session strategy, the `secret` (which must be
 * available to BOTH runtimes), the `authorized` callback used by
 * middleware, and the module-augmentation declarations that teach
 * NextAuth's types about the extra fields the `session` callback
 * projects.
 *
 * No `@/` imports here: middleware bundles the Edge runtime and
 * relative paths keep the bundle predictable.
 */
import type { NextAuthConfig } from "next-auth";
import type { DefaultSession } from "next-auth";

/**
 * Route prefixes that require an authenticated user.
 *
 * Matches the v1 set: dashboard (post-onboarding) and onboarding
 * (pre-dashboard wizard). The youtube-connect callback is gated
 * client-side by `<AuthGuard>` (no server middleware check) because
 * the popup-flow needs the page to actually render.
 */
const PROTECTED_PREFIXES = ["/dashboard", "/onboarding"] as const;

/**
 * Auth-only routes an already-signed-in user should be bounced off
 * of — the back button shouldn't re-surface a sign-in form.
 */
const AUTH_ROUTES = ["/signin", "/signup"] as const;

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Pull AUTH_SECRET from process.env with a loud dev fallback.
 *
 * MUST live in this edge-safe module — both the Edge middleware
 * (which runs `assertConfig` before any route handler) and the Node
 * `/api/auth/*` handler use it. If we set it only in `auth.ts`, the
 * Edge runtime logs `MissingSecret` on every request.
 *
 * In production this MUST be a 32+ char random secret. The fallback
 * below is for fresh `pnpm dev` only — the moment you wire a real
 * `.env.local`, replace it.
 */
const secret =
  process.env.AUTH_SECRET ??
  process.env.NEXTAUTH_SECRET ??
  "dev-only-auth-secret-replace-me-with-32-plus-chars";

export const authConfig = {
  secret,
  pages: {
    signIn: "/signin",
  },
  // JWT session strategy: NextAuth stores the backend-issued access +
  // refresh tokens inside its own session JWT, kept in an httpOnly
  // cookie. The Express API still verifies every request via the
  // short-lived access JWT — NextAuth is invisible to the API.
  session: { strategy: "jwt" },
  // Providers are added in `auth.ts` (Node-only). Empty here is
  // intentional — `authorized` doesn't need them.
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isAuthed = !!auth?.user;
      const { pathname } = request.nextUrl;

      // Unauthed → protected: let NextAuth redirect to /signin. The
      // original path is preserved via `callbackUrl`, which NextAuth
      // threads through sign-in → post-sign-in redirect.
      if (isProtected(pathname) && !isAuthed) return false;

      // Authed → auth route: bounce to /dashboard. We synthesize the
      // redirect here so NextAuth's default "redirect to home" doesn't
      // drop the user on /.
      if (isAuthRoute(pathname) && isAuthed) {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        url.search = "";
        return Response.redirect(url);
      }

      return true;
    },
  },
} satisfies NextAuthConfig;

/**
 * NextAuth type augmentations.
 *
 * The auth module persists the access/refresh tokens (and the
 * `onboardingCompleted` + `displayName` flags) into NextAuth's
 * session JWT. Those values are projected onto `session.user` in the
 * `session` callback of `auth.ts` and consumed client-side via
 * `useSession()` — both in `<OnboardingGuard>` (zero-API-call
 * routing) and in the dashboard chrome (greeting by display name).
 *
 * Without these module augmentations, NextAuth's strict types would
 * reject `session.user.onboardingCompleted` at the call sites.
 *
 * Note: we only augment the `next-auth` surface (User + Session).
 * NextAuth's JWT interface (`@auth/core/jwt` / `next-auth/jwt`)
 * extends `Record<string, unknown>` and is therefore already open —
 * the `jwt` callback's `token` parameter accepts arbitrary keys, and
 * we narrow at use sites with a small `AuthToken` shape cast.
 * Augmenting the JWT module also requires `@auth/core` to be a
 * direct dependency (pnpm strict mode hides transitives), so we
 * skip the JWT augmentation entirely and cast at the boundary.
 */
declare module "next-auth" {
  interface User {
    /** Latest `onboardingCompleted` from the backend. */
    onboardingCompleted?: boolean;
    /** Latest `displayName` from `UserProfile.displayName`. */
    displayName?: string | null;
  }

  interface Session {
    /** Short-lived bearer token from the backend. */
    accessToken?: string;
    /** Internal user id (JWT `sub`). */
    userId?: string;
    user: DefaultSession["user"] & {
      onboardingCompleted?: boolean;
      displayName?: string | null;
    };
  }
}

/**
 * Shape of NextAuth's JWT payload as we use it. Kept here next to
 * the `next-auth` augmentation so future readers find both pieces
 * of the auth-typing story in one file.
 *
 * `token` inside the `jwt` callback is typed as `JWT extends Record<
 * string, unknown>` from @auth/core, so any property read returns
 * `unknown` until we narrow with this helper.
 */
export interface AuthToken {
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
  userId?: string;
  onboardingCompleted?: boolean;
  displayName?: string | null;
}