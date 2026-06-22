/**
 * Express Request type augmentations for the API.
 *
 * Centralizes all `req.<custom>` augmentations so that:
 *   1. Every consuming module sees them (TypeScript picks up the
 *      augmentation because the file is imported as a side-effect).
 *   2. The augmentation is co-located in a `.d.ts` so it's plain
 *      declarations (no runtime code) and never needs to be edited.
 */
import type { AuthUser } from "@clipflow/types";

declare module "express-serve-static-core" {
  interface Request {
    /**
     * Unique identifier for this request. Assigned by `requestIdMiddleware`
     * (or a reverse proxy). Echoed back in the `X-Request-Id` response
     * header and used as the log correlation key by pino-http.
     */
    id: string;

    /**
     * Populated by `requireAuth` middleware after a successful JWT
     * verification. The full user row is fetched later by services.
     */
    user?: AuthUser;
  }
}

export {};
