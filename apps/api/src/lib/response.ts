/**
 * Centralized response helpers for the Express API.
 *
 * Every controller routes through one of these helpers so the wire
 * contract is always `{ success, message, data }` on 2xx and
 * `{ success: false, message, data: null, error?, details? }` on
 * non-2xx (handled by the central error middleware). Keeping the
 * envelope here — rather than re-typed at every call site — is what
 * makes "centralize the API response" actually hold: there is no
 * second way to send a success body.
 */
import type { Response } from "express";
import type { ApiSuccess } from "@clipflow/types";

/**
 * Send a 2xx response wrapped in the standard envelope.
 *
 * @param res Express response.
 * @param data The payload to expose under `data`. Use `null` for
 *   endpoints that don't carry a body (logout, change-password, etc.).
 * @param message Human-friendly summary, safe to display to the user.
 * @param statusCode HTTP status code. Defaults to 200.
 * @returns The Express response, for chaining.
 */
export const sendOk = <T>(
  res: Response,
  data: T,
  message = "OK",
  statusCode = 200,
): Response => {
  const body: ApiSuccess<T> = { success: true, message, data };
  return res.status(statusCode).json(body);
};

/**
 * Send a 201 Created response wrapped in the standard envelope.
 * Sugar over `sendOk(res, data, message, 201)` so the call site reads
 * as "this created something".
 */
export const sendCreated = <T>(
  res: Response,
  data: T,
  message = "Created",
): Response => sendOk(res, data, message, 201);

/**
 * Send a 200 OK response with `data: null`. Used by endpoints that
 * previously returned 204 No Content (logout, change-password,
 * disconnect youtube, cancel pending upload, delete video) so the
 * frontend never has to special-case an empty body.
 */
export const sendEmpty = (
  res: Response,
  message = "No content",
): Response => sendOk(res, null, message, 200);