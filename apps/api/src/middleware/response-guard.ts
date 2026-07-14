/**
 * Response guard — defensive safety net.
 *
 * Express's central error handler is supposed to be the one place that
 * emits failure envelopes. But that contract depends on every code
 * path (controller, async middleware, custom error from a third-party
 * library, etc.) either sending a response OR forwarding the error to
 * `next(err)`. If any one of those slips, the request just sits
 * pending — no status, no body, no signal to the client.
 *
 * This middleware closes that gap. It runs as the first middleware
 * after request-id and before every route, and listens for the
 * response's `close` event. If the connection is about to drop with
 * no response having been written, it emits a 500 envelope in the
 * standard `ApiFailure` shape so the client always gets a
 * structured error when something on the server misbehaves.
 *
 * The middleware is intentionally a no-op on the happy path:
 * `headersSent === true` short-circuits before we touch `res`.
 */
import type { NextFunction, Request, Response } from "express";
import type { ApiFailure } from "@clipflow/types";

/**
 * Express middleware that ensures every request that completes
 * (either gracefully or by client/server abort) gets a response
 * sent before the connection closes.
 */
export const responseGuard = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  res.on("close", () => {
    if (res.headersSent) return;
    const body: ApiFailure = {
      success: false,
      message:
        "The server didn't complete this request. Please try again — if it keeps happening, contact support.",
      data: null,
      error: "REQUEST_ABORTED",
    };
    try {
      res.status(500).json(body);
    } catch {
      // Connection already gone — there's nothing we can send.
    }
  });
  next();
};
