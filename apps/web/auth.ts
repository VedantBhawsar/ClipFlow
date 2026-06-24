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
import type { NextAuthResult } from "next-auth";

import { env } from "@/lib/env";
import { authConfig } from "./auth.config";

const config: NextAuthConfig = {
  ...authConfig,
  providers: [
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

        const data = (await res.json()) as {
          user: { id: string; email: string; name: string | null };
          accessToken: string;
          refreshToken: string;
          accessTokenExpiresAt: number;
          refreshTokenExpiresAt: number;
        };

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
    async jwt({ token, user }) {
      // First sign-in: user object is populated from `authorize`.
      if (user) {
        const u = user as {
          id?: string;
          accessToken?: string;
          refreshToken?: string;
          accessTokenExpiresAt?: number;
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
          };
        }
      }

      const expiresAt = token.accessTokenExpiresAt;
      if (typeof expiresAt !== "number") return token;

      // 60s buffer so we don't refresh at the exact instant of expiry
      // (clock skew between this server and the backend would cause
      // a spurious 401 right after a "successful" refresh).
      if (Date.now() < expiresAt - 60_000) return token;

      // Expired (or about to): rotate.
      if (typeof token.refreshToken !== "string") return null;

      try {
        const res = await fetch(`${env.apiBaseUrl}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: token.refreshToken }),
        });
        if (!res.ok) return null;

        const data = (await res.json()) as {
          accessToken: string;
          refreshToken: string;
          accessTokenExpiresAt: number;
        };

        return {
          ...token,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          accessTokenExpiresAt: data.accessTokenExpiresAt,
        };
      } catch {
        return null;
      }
    },
    /**
     * Projects the data the client needs into `session`. The frontend
     * reads `session.accessToken` (via the `useApi()` factory) and
     * `session.user.id` (via the bundle query, etc.).
     */
    async session({ session, token }) {
      if (typeof token.accessToken === "string") {
        session.accessToken = token.accessToken;
      }
      if (typeof token.userId === "string") {
        session.user = {
          ...session.user,
          id: token.userId,
        };
      }
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