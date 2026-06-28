import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export default NextAuth(authConfig).auth();

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