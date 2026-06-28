import type { Response } from "express";

/**
 * Write an SSE event to the response stream.
 *
 * Callers must have already set SSE headers
 * (`Content-Type: text/event-stream`, `Cache-Control: no-cache`,
 * `Connection: keep-alive`) and flushed headers.
 */
export const sseWrite = (
  res: Response,
  event: string,
  data: string,
): void => {
  res.write(`event: ${event}\ndata: ${data}\n\n`);
};
