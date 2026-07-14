/**
 * Tests for `buildRequestTimeout`.
 *
 * Two contracts under test:
 *   1. A handler that responds before the timeout must receive a
 *      normal 200 response — the timer is cleared and stays out of
 *      the way.
 *   2. A handler that hangs past the timeout must receive a 503
 *      envelope with `error: "REQUEST_TIMEOUT"` instead of being
 *      left pending forever.
 */
import { describe, it, expect } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { buildRequestTimeout } from "./request-timeout.js";

/**
 * Spin up an Express app with the timeout middleware and a custom
 * handler. Returns the bound port plus a close hook.
 */
const startApp = (
  handler: express.RequestHandler,
  timeoutMs: number,
): Promise<{ port: number; close: () => Promise<void> }> => {
  return new Promise((resolve, reject) => {
    const app = express();
    app.use(buildRequestTimeout(timeoutMs));
    app.get("/", handler);
    const server: Server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (typeof addr !== "object" || addr === null) {
        reject(new Error("Could not read server address"));
        return;
      }
      resolve({
        port: addr.port,
        close: () =>
          new Promise<void>((r) => {
            server.close(() => r());
          }),
      });
    });
    server.on("error", reject);
  });
};

describe("buildRequestTimeout", () => {
  it("emits a 503 REQUEST_TIMEOUT envelope when a handler hangs longer than the timeout", async () => {
    const { port, close } = await startApp(() => {
      // Pretend an upstream call is hanging. No res.json, no res.end.
    }, 100);

    const controller = new AbortController();
    const guard = setTimeout(() => controller.abort(), 3000);
    guard.unref?.();

    const start = Date.now();
    const res = await fetch(`http://127.0.0.1:${port}/`, { signal: controller.signal });
    const elapsed = Date.now() - start;
    const json = (await res.json()) as { success: boolean; message: string; error: string; data: null };
    clearTimeout(guard);
    await close();

    expect(res.status).toBe(503);
    expect(elapsed).toBeLessThan(1500);
    expect(json).toMatchObject({
      success: false,
      error: "REQUEST_TIMEOUT",
      data: null,
    });
    expect(typeof json.message).toBe("string");
    expect(json.message.length).toBeGreaterThan(0);
  });

  it("does not interfere when the handler responds before the timeout fires", async () => {
    const { port, close } = await startApp((_req, res) => {
      res.status(200).json({ success: true, message: "OK", data: "fast" });
    }, 1000);

    const res = await fetch(`http://127.0.0.1:${port}/`);
    const json = (await res.json()) as { success: boolean; message: string; data: string };
    await close();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true, message: "OK", data: "fast" });
  });
});
