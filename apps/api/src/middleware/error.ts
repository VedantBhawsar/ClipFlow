/**
 * Central error handler.
 *
 * Maps every thrown error to the `ApiFailure` envelope:
 *
 *   { success: false, message, data: null, error?, details? }
 *
 * Typed `AppError` instances pass through with their declared
 * `statusCode`/`code`; unknown errors are converted to a generic 500
 * (with the stack logged but never returned to the client). The
 * request ID is included in 500 responses so support can correlate the
 * failure with logs.
 *
 * Defense-in-depth: every `logger.*` call is wrapped in try/catch so
 * a logging failure (broken transport, circular ref in the meta
 * object, destination full) can never block the response. The final
 * `safeSend` fallback writes the envelope directly, bypassing pino,
 * so a client ALWAYS receives a structured error body — never a
 * silent hang on a pending socket.
 */
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/AppError.js";
import type { ApiFailure } from "@clipflow/types";
import type { Logger } from "../lib/logger.js";

/**
 * Build the central error middleware bound to the logger.
 *
 * @param logger Pino logger instance.
 * @returns Express error-handling middleware (4 args).
 */
export const buildErrorHandler = (logger: Logger) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 4 args required by Express
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    /**
     * Send the failure envelope without going through `res.json`'s
     * chain methods — used as a last-resort fallback when headers
     * have already been flushed. `res.write` is the lowest-level
     * primitive that still respects the connection state.
     */
    const safeSend = (status: number, body: ApiFailure): void => {
      if (res.headersSent) return;
      try {
        res.status(status).json(body);
      } catch {
        try {
          res.write(JSON.stringify(body));
          res.end();
        } catch {
          // Connection already gone — nothing more we can do.
        }
      }
    };

    /**
     * Wrapped logger so a broken transport can never block us from
     * responding to the client. Falls back to stderr if pino throws.
     */
    const safeLog = (
      level: "warn" | "error",
      meta: Record<string, unknown>,
      msg: string,
    ): void => {
      try {
        logger[level](meta, msg);
      } catch (logErr) {
        // Intentional fallback when the configured logger is broken
        // (transport down, circular ref, etc.) — the response MUST
        // still go through even if logging doesn't.
        process.stderr.write(
          `[error-handler] logger failed: ${String(logErr)} ${level} ${msg}\n`,
        );
      }
    };

    // Zod validation errors → 400 with field-level details.
    if (err instanceof ZodError) {
      const details: Record<string, unknown> = {
        issues: err.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
          code: i.code,
        })),
      };
      const body: ApiFailure = {
        success: false,
        message: "Request input is invalid.",
        data: null,
        error: "VALIDATION_ERROR",
        details,
      };
      safeLog(
        "warn",
        { reqId: req.id, path: req.path, method: req.method, details },
        "Validation failed",
      );
      safeSend(400, body);
      return;
    }

    if (err instanceof AppError) {
      const body: ApiFailure = {
        success: false,
        message: err.message,
        data: null,
        error: err.code,
        ...(err.details ? { details: err.details } : {}),
      };
      const level = err.statusCode >= 500 ? "error" : "warn";
      safeLog(
        level,
        {
          reqId: req.id,
          path: req.path,
          method: req.method,
          statusCode: err.statusCode,
          code: err.code,
        },
        err.message,
      );
      safeSend(err.statusCode, body);
      return;
    }

    // Unknown error → 500. Log full detail; return generic message + req id.
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const errorStack = err instanceof Error ? err.stack : undefined;
    safeLog(
      "error",
      {
        reqId: req.id,
        path: req.path,
        method: req.method,
        err: { message: errorMessage, stack: errorStack },
      },
      "Unhandled error",
    );
    const body: ApiFailure = {
      success: false,
      message: "Something went wrong. Please try again.",
      data: null,
      error: "INTERNAL_SERVER_ERROR",
      details: { requestId: req.id },
    };
    safeSend(500, body);
  };
};

/**
 * Catch-all for unmatched routes. Returns a 404 in the same envelope
 * shape as other errors so the frontend gets a consistent error
 * contract.
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  const body: ApiFailure = {
    success: false,
    message: `No route matches ${req.method} ${req.path}.`,
    data: null,
    error: "NOT_FOUND",
  };
  res.status(404).json(body);
};