/**
 * Request-ID middleware.
 *
 * Assigns a UUID to every incoming request, stashes it on `req.id`, and
 * echoes it back as the `X-Request-Id` response header. The same value is
 * used by the pino-http logger so a single request can be traced from the
 * API log to a support ticket.
 *
 * The `req.id` type lives in `types/express.d.ts` so every consuming
 * module sees the augmentation.
 */
import type { NextFunction, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";

/**
 * Express middleware that ensures every request has an `id`.
 *
 * If the client provided an `X-Request-Id` header (e.g. from a reverse
 * proxy or upstream service), it's preserved; otherwise a new UUID is
 * generated.
 */
export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const incoming = req.header("x-request-id");
  const id = incoming && incoming.length > 0 && incoming.length <= 128 ? incoming : uuidv4();
  req.id = id;
  res.setHeader("X-Request-Id", id);
  next();
};
