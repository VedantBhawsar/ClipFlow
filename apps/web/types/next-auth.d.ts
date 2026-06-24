/**
 * Augment NextAuth's Session and JWT types with the fields we stash
 * inside them. The frontend reads these via `useSession()` /
 * `useApi()`; the backend never imports this file.
 */
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  /** Shape of `session` in `useSession()`, `auth()` callbacks, etc. */
  interface Session {
    /**
     * Short-lived JWT (15 min) used as `Authorization: Bearer` on
     * every request to the Express API. Refreshed silently by
     * NextAuth's `jwt` callback before it expires.
     */
    accessToken: string;
    user: {
      /** Stable user id. Comes from the JWT in the `jwt` callback. */
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  /** Shape of `token` in the `jwt` callback and `events.signOut`. */
  interface JWT {
    accessToken: string;
    refreshToken: string;
    /** Unix-ms timestamp; access JWT is refreshed 60s before this. */
    accessTokenExpiresAt: number;
    userId: string;
  }
}

// Required so TS picks up the augmentation as a module (not a script).
export {};