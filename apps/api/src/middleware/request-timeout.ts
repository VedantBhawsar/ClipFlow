/**
 * Hard per-request timeout.
 *
 * Caps every request at `timeoutMs` (default 30 s). When the timer fires
 * and the response is still unflushed, we emit a 503 envelope in the
 * standard `ApiFailure` shape and force-close the underlying socket so
 * the client doesn't sit on a half-opened connection.
 *
 * Without this, a controller that hangs on an upstream call (Prisma
 * pool exhaustion, dead Redis, third-party API with no AbortSignal,
 * etc.) leaves the request pending indefinitely — the browser's
 * spinner never resolves and the user has no signal that anything
 * went wrong on the server. The timeout guarantees the server
 * always responds, with a clear, user-friendly message.
 *
 * Must be installed AFTER `requestIdMiddleware` (so the 503 envelope
 * carries the request id) and BEFORE any router so every route is
 * covered. Pair with `responseGuard` (installed first) for a
 * defense-in-depth safety net against request hangs.
 */
import type { NextFunction, Request, Response } from "express";
import type { ApiFailure } from "@clipflow/types";

/**
 * Build a request-timeout middleware.
 *
 * @param timeoutMs Hard cap per request, in milliseconds. Default: 30 000.
 * @returns Express middleware.
 */
export const buildRequestTimeout =
  (timeoutMs = 30_000) =>
  (req: Request, res: Response, next: NextFunction): void => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled || res.headersSent) return;
      settled = true;
      const body: ApiFailure = {
        success: false,
        message:
          "The request took too long. Please try again — if it keeps happening, our servers may be having a moment.",
        data: null,
        error: "REQUEST_TIMEOUT",
      };
      try {
        res.status(503).json(body);
      } catch {
        // Socket may already be closed by the client; nothing more to do.
      }
      // Force the socket closed so buffered bytes are flushed and the
      // server releases the request slot. Calling destroy() on an
      // already-closed socket is a no-op.
      req.destroy();
    }, timeoutMs);
    // unref so a stuck timer never keeps the Node process alive on its own.
    timer.unref?.();

    const clear = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
    };
    res.on("finish", clear);
    res.on("close", clear);

    next();
  };
