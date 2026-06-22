import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge middleware.
 *
 * Trade-off (documented per the spec): the JWT lives in a non-httpOnly
 * cookie (see lib/api-client.ts) so we *can* read it here on the
 * server. But the actual onboarding-completed decision lives in the
 * auth context, which is hydrated client-side from /api/auth/me — so
 * for v1 this middleware does the cheap "is there a token at all"
 * check and the client-side guards handle the finer-grained routing.
 *
 * If/when the cookie becomes httpOnly, this middleware would need to
 * proxy through a server route to validate the token. The /dashboard,
 * /onboarding/*, and /youtube-connect rules below would expand to
 * include that server check.
 */

const AUTH_COOKIE = "clipflow_token";

// Routes that require the user to be authenticated at all.
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/onboarding",
  "/youtube-connect",
] as const;

// Routes an authenticated user should NOT be sitting on (they're
// sign-in / sign-up screens — bouncing signed-in users away keeps the
// back-button from re-surfacing an auth form they already completed).
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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_COOKIE)?.value;

  // Unauthenticated user hitting a protected route → send to /signin,
  // preserving the original target via ?next= so we can redirect back
  // after a successful sign-in.
  if (isProtected(pathname) && !token) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Authenticated user sitting on a sign-in / sign-up screen → bounce
  // them to the dashboard. (The dashboard's OnboardingGuard takes it
  // from there: completed users land, incomplete ones go to /onboarding.)
  if (isAuthRoute(pathname) && token) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

/**
 * Run on every request except Next's own static assets / image
 * optimizer / public files (handled by `matcher`).
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
