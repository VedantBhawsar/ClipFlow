/**
 * Request validation middleware.
 *
 * Wraps zod parsing so controllers don't have to repeat `.parse()` calls
 * for `body`, `params`, and `query`. Parsed values are attached back to
 * `req` under the same keys (`req.body`, `req.params`, `req.query`) so
 * downstream code can access them with the same property access syntax.
 *
 * Failures throw `ZodError`, which the central error middleware maps to a
 * 400 response with field-level details.
 */
import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

/**
 * Shape accepted by `validate()` — any of `body`, `params`, `query` may
 * have a zod schema.
 */
export interface ValidationSchemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

/**
 * Build a middleware that validates the configured parts of the request
 * and attaches the parsed results back.
 *
 * @param schemas Per-part zod schemas.
 * @returns Express middleware.
 */
export const validate =
  (schemas: ValidationSchemas) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        // `req.body` is `any` on Express's request type so this assignment
        // is safe and downstream controllers can read the parsed shape.
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.params) {
        // `req.params` is `ParamsDictionary` at the type level but a plain
        // object at runtime. Object.assign lets us overlay the parsed
        // keys without violating the readonly surface type.
        const parsed = schemas.params.parse(req.params) as Record<string, string>;
        for (const [k, v] of Object.entries(parsed)) {
          (req.params as Record<string, string>)[k] = v;
        }
      }
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query) as Record<string, unknown>;
        for (const [k, v] of Object.entries(parsed)) {
          (req.query as Record<string, unknown>)[k] = v;
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  };
