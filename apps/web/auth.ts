/**
 * Full NextAuth (Auth.js v5) configuration.
 *
 * Architectural split:
 *   - Edge middleware imports only `auth.config.ts` (no Node-only deps).
 *   - This file imports that edge-safe config, layers the Credentials
 *     provider on top, and adds the JWT refresh + session callbacks
 *     and the sign-out server-side revoke. It's only bundled for the
 *     Node runtime (the `/api/auth/[...nextauth]` route handler).
 *
 * Token flow:
 *   - User signs in with email/password via the Credentials provider.
 *   - `authorize` POSTs to Express `/api/auth/login`, which returns
 *     { user, accessToken, refreshToken, accessTokenExpiresAt, ... }.
 *   - Those tokens get stored inside NextAuth's JWT session cookie
 *     (httpOnly, signed).
 *   - On every `jwt` callback (i.e. when the session is read),
 *     NextAuth checks if the access token is about to expire. If so,
 *     it silently POSTs to Express `/api/auth/refresh`, gets a fresh
 *     pair, and persists them. This is the "we don't manually manage
 *     tokens" payoff.
 *   - The frontend hooks read `session.accessToken` via `useApi()`
 *     and attach it as `Authorization: Bearer <accessToken>` on every
 *     request to Express.
 *
 * The Express API never sees NextAuth — it still does its own JWT
 * verification in `middleware/auth.ts`. The two systems communicate
 * only through the access/refresh token pair.
 */
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { NextAuthResult } from "next-auth";

import { env } from "@/lib/env";
import { authConfig, type AuthToken } from "./auth.config";

const config: NextAuthConfig = {
  ...authConfig,
  providers: [
    Google,
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        // Delegate credential verification to Express. The backend is
        // the source of truth for users — NextAuth just orchestrates
        // the session cookie here.
        let res: Response;
        try {
          res = await fetch(`${env.apiBaseUrl}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });
        } catch {
          // Network failure — NextAuth will render a generic sign-in
          // error. We deliberately don't surface the underlying
          // message; it's noise to the user.
          return null;
        }

        if (!res.ok) return null;

        // The backend wraps every response in the centralized
        // `{ success, message, data }` envelope — `api-client.ts`
        // unwraps it on the way out, but here in `authorize` we
        // parse the raw response ourselves. A failure envelope with
        // `success: false` returns `null` (NextAuth renders a generic
        // sign-in error).
        const envelope = (await res.json()) as {
          success?: boolean;
          message?: string;
          data?: {
            user: { id: string; email: string; name: string | null };
            accessToken: string;
            refreshToken: string;
            accessTokenExpiresAt: number;
            refreshTokenExpiresAt: number;
            /**
             * Backend-issued session flags. Baked into the NextAuth
             * session JWT so `<OnboardingGuard>` and the dashboard
             * chrome can read them without an API call.
             */
            onboardingCompleted: boolean;
            displayName: string | null;
          };
        };

        if (envelope.success !== true || !envelope.data) return null;
        const data = envelope.data;

        // The object we return here is what populates `user` in the
        // jwt callback below. NextAuth also reads `id`/`email`/`name`
        // for the default user fields.
        return {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name ?? undefined,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          accessTokenExpiresAt: data.accessTokenExpiresAt,
          onboardingCompleted: data.onboardingCompleted,
          displayName: data.displayName,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Called on every session access. We use it to:
     *   1. Persist tokens into the JWT on first sign-in.
     *   2. Silently refresh the access token when it's about to expire.
     *
     * Returning `null` from the callback forces a sign-out (NextAuth
     * removes the cookie). We do that when refresh fails so the user
     * is sent back to /signin instead of getting stuck with a dead
     * access token.
     */
    async jwt({ token, user, account, trigger, session }) {
      // NextAuth's JWT is typed as `Record<string, unknown> & DefaultJWT`
      // — see `AuthToken` in auth.config.ts. Narrowing it here makes
      // every property read properly typed without fighting module
      // augmentation across `@auth/core/jwt` (which is not a direct
      // pnpm dependency of this app).
      const t = token as AuthToken;

      // Google OAuth sign-in: exchange the verified ID token for
      // Express-issued access + refresh tokens via the backend's
      // `/api/auth/google` endpoint. The backend verifies the ID token
      // independently, finds or creates the user, and returns the same
      // token pair that email/password login returns — so the rest of
      // the JWT / session callbacks treat both flows identically.
      if (account?.provider === "google" && account.id_token) {
        try {
          const res = await fetch(`${env.apiBaseUrl}/api/auth/google`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken: account.id_token }),
          });
          const envelope = (await res.json()) as {
            success?: boolean;
            data?: {
              user: { id: string };
              accessToken: string;
              refreshToken: string;
              accessTokenExpiresAt: number;
              onboardingCompleted: boolean;
              displayName: string | null;
            };
          };
          if (envelope.success === true && envelope.data) {
            const d = envelope.data;
            return {
              ...token,
              accessToken: d.accessToken,
              refreshToken: d.refreshToken,
              accessTokenExpiresAt: d.accessTokenExpiresAt,
              userId: d.user.id,
              onboardingCompleted: d.onboardingCompleted ?? false,
              displayName: d.displayName ?? null,
            };
          }
        } catch {
          // Network failure — fall through to return null so NextAuth
          // refuses the sign-in and the user sees a generic error.
        }
        // Google auth failed — don't create a session.
        return null;
      }

      // First sign-in: user object is populated from `authorize`.
      if (user) {
        const u = user as {
          id?: string;
          accessToken?: string;
          refreshToken?: string;
          accessTokenExpiresAt?: number;
          onboardingCompleted?: boolean;
          displayName?: string | null;
        };
        if (
          typeof u.accessToken === "string" &&
          typeof u.refreshToken === "string" &&
          typeof u.accessTokenExpiresAt === "number" &&
          typeof u.id === "string"
        ) {
          return {
            ...token,
            accessToken: u.accessToken,
            refreshToken: u.refreshToken,
            accessTokenExpiresAt: u.accessTokenExpiresAt,
            userId: u.id,
            onboardingCompleted: u.onboardingCompleted ?? false,
            displayName: u.displayName ?? null,
          };
        }
      }

      // Client-driven update: useSession().update(...) lands here with
      // `trigger === "update"` and the payload passed to update() in
      // `session`. The onboarding wizard uses this path to flip
      // `onboardingCompleted` to true and refresh `displayName` after
      // the profile POST succeeds — without this branch the JWT would
      // keep its stale `onboardingCompleted: false` and the
      // OnboardingGuard would bounce the user back to
      // /onboarding/profile on the next render.
      //
      // We only patch the keys the caller explicitly sent so a future
      // update({...}) with a partial shape can't accidentally null-out
      // displayName. The callback's return type is `JWT` (which is
      // `Record<string, unknown> & DefaultJWT`), so we mutate a
      // shallow copy and return it — that preserves the open index
      // signature NextAuth expects.
      if (trigger === "update" && session && typeof session === "object") {
        const u = session as Partial<AuthToken>;
        const next = { ...token };
        if (typeof u.onboardingCompleted === "boolean") {
          next.onboardingCompleted = u.onboardingCompleted;
        }
        if ("displayName" in u) {
          next.displayName = u.displayName ?? null;
        }
        return next;
      }

      const expiresAt = t.accessTokenExpiresAt;
      if (typeof expiresAt !== "number") return token;

      // 60s buffer so we don't refresh at the exact instant of expiry
      // (clock skew between this server and the backend would cause
      // a spurious 401 right after a "successful" refresh).
      if (Date.now() < expiresAt - 60_000) return token;

      // Expired (or about to): rotate.
      if (typeof t.refreshToken !== "string") return null;

      try {
        const res = await fetch(`${env.apiBaseUrl}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: t.refreshToken }),
        });
        if (!res.ok) return null;

        // Backend wraps every response in the centralized
        // `{ success, message, data }` envelope (see api-client.ts).
        // `success: false` means the refresh token is dead — force
        // sign-out by returning `null`.
        const envelope = (await res.json()) as {
          success?: boolean;
          data?: {
            accessToken: string;
            refreshToken: string;
            accessTokenExpiresAt: number;
            /**
             * Latest session flags from the backend. Refreshed on
             * every token rotation so a long-lived session picks up
             * onboarding-completion or display-name edits without
             * forcing a re-login.
             */
            onboardingCompleted: boolean;
            displayName: string | null;
          };
        };
        if (envelope.success !== true || !envelope.data) return null;
        const data = envelope.data;

        return {
          ...token,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          accessTokenExpiresAt: data.accessTokenExpiresAt,
          onboardingCompleted: data.onboardingCompleted,
          displayName: data.displayName,
        };
      } catch {
        return null;
      }
    },
    /**
     * Projects the data the client needs into `session`. The frontend
     * reads `session.accessToken` (via the `useApi()` factory),
     * `session.user.id` / `session.user.onboardingCompleted` (via the
     * session itself, no API call), and `session.user.displayName`
     * (so the dashboard chrome can greet by name).
     */
    async session({ session, token }) {
      // Same narrowing as the jwt callback — see AuthToken in
      // auth.config.ts for the rationale.
      const t = token as AuthToken;
      if (typeof t.accessToken === "string") {
        session.accessToken = t.accessToken;
      }
      if (typeof t.userId === "string") {
        session.user = {
          ...session.user,
          id: t.userId,
        };
      }
      session.user = {
        ...session.user,
        onboardingCompleted: t.onboardingCompleted ?? false,
        displayName: t.displayName ?? null,
      };
      return session;
    },
  },
  events: {
    /**
     * Server-side revoke of the refresh token. Runs when the client
     * calls `signOut()` — NextAuth's /api/auth/signout route handler
     * triggers this on the server, so the fetch to Express is
     * server-to-server (no CORS issue).
     */
    async signOut(message) {
      if (!("token" in message)) return;
      const refreshToken = message.token?.refreshToken;
      if (typeof refreshToken !== "string") return;

      try {
        await fetch(`${env.apiBaseUrl}/api/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        // Best-effort. The session cookie is already cleared; a
        // network blip here just means the row stays active until
        // its natural expiry. The rotation chain still works — the
        // worst case is a stale row, not a leaked token.
      }
    },
  },
};

const nextAuthResult: NextAuthResult = NextAuth(config);
export const handlers: NextAuthResult["handlers"] = nextAuthResult.handlers;
export const auth: NextAuthResult["auth"] = nextAuthResult.auth;
export const signIn: NextAuthResult["signIn"] = nextAuthResult.signIn;
export const signOut: NextAuthResult["signOut"] = nextAuthResult.signOut;