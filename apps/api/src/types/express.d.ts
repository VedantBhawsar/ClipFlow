/**
 * Express Request type augmentations for the API.
 *
 * The `Request` interface in `@types/express` extends the one declared in
 * `@types/express-serve-static-core`. Augmenting `express-serve-static-core`
 * is the documented way to add properties to the `Request` type, but in
 * practice the augmentation only applies if this file is loaded
 * transitively from every consumer. Because most controllers do NOT
 * import this file directly, we use the `Express.Request` global
 * namespace trick instead: it merges into the project-wide ambient
 * declaration space and applies to every `Request` reference regardless
 * of import path.
 *
 * The shape mirrors `AuthUser` in `packages/types/src/index.ts` but is
 * redeclared inline to keep this file standalone. If `AuthUser` gains a
 * required field, update both.
 */
import "express";

declare global {
  namespace Express {
    interface Request {
      /**
       * Unique identifier for this request. Assigned by
       * `requestIdMiddleware` (or a reverse proxy). Echoed back in the
       * `X-Request-Id` response header and used as the log correlation
       * key by pino-http.
       */
      id: string;

      /**
       * Populated by `requireAuth` middleware after a successful JWT
       * verification. The full user row is fetched later by services.
       */
      user?: {
        id: string;
        email: string;
      };
    }
  }
}
