import NextAuth from "next-auth";
import type { NextMiddleware } from "next/server";
import { authConfig } from "./auth.config";

/**
 * Export `.auth` as a function reference, NOT invoked.
 *
 * Next.js 16 + Auth.js v5 pitfall (Turbopack bundles middleware.ts
 * with the RSC path): calling `NextAuth(authConfig).auth()` at module
 * load invokes the auth handler eagerly, which dispatches into code
 * that calls `next/headers`'s `headers()`. There is no request scope
 * at module evaluation → runtime error:
 *   `headers` was called outside a request scope
 * Exporting the function reference defers the call to per-request
 * invocation, where `headers()` resolves correctly.
 *
 * The `as NextMiddleware` cast avoids TS2742 (the inferred type
 * can't be named without a private reference into next-auth's
 * `lib/` and `lib/types` subpaths, which aren't portable). The
 * runtime contract is identical.
 */
export default NextAuth(authConfig).auth as NextMiddleware;

/**
 * Run on every request except Next's own static assets / image
 * optimizer / public files (handled by `matcher`).
 *
 * The /api/auth/* path is excluded so NextAuth's own route handlers
 * can serve their callbacks — middleware would otherwise try to
 * authorize them.
 */
export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};