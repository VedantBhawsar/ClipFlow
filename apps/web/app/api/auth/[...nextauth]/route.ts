/**
 * NextAuth (Auth.js v5) route handler.
 *
 * Mounts `/api/auth/*` (signin, signout, callback, session, csrf, etc.)
 * on the Next.js side. The browser-facing endpoints are owned by
 * NextAuth; the actual credential verification and token rotation
 * happens over the wire to Express (see apps/web/auth.ts).
 *
 * Auth.js v5 exports a single `handlers` object that bundles the GET
 * and POST route handlers — Next.js's route file convention wants
 * those exported as named symbols, so we destructure here.
 */
import { handlers } from "@/auth";

export const { GET, POST } = handlers;