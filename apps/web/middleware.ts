/**
 * Edge middleware.
 *
 * The auth + onboarding redirect logic lives in `auth.config.ts`'s
 * `authorized` callback. This file just wires that callback into
 * NextAuth's `auth()` middleware wrapper, which reads the session
 * cookie (httpOnly + signed) and populates `req.auth`.
 *
 * NextAuth's session cookie is httpOnly and Secure (in production),
 * so the Edge runtime can safely read it. The previous implementation
 * read a non-httpOnly cookie set via `document.cookie` — that's gone,
 * removing the XSS-token-exfiltration risk.
 *
 * NextAuth's `.auth()` returns a handler whose inferred type pulls in
 * private packages (next-auth/lib/types) that aren't portable across
 * our `.d.ts` surface. We use the runtime value directly and cast at
 * the export boundary — the function is functionally identical to
 * `NextMiddleware`, just typed at the next/server level via the cast.
 */
import NextAuth, { type NextAuthResult } from "next-auth";

import { authConfig } from "./auth.config";

const result: NextAuthResult = NextAuth(authConfig);

const middlewareFn = result.auth((_req) => {
  // All redirect decisions happen inside authConfig.callbacks.authorized.
  // This handler returns undefined (Next.js continues the request)
  // unless authorized returned a Response/redirect above.
});

// Cast at the export — the runtime shape is correct for Next.js's
// Edge middleware, only the type package differs.
export default middlewareFn as unknown as (
  req: unknown,
  event: unknown,
) => unknown;

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