/**
 * HTTP server lifecycle.
 *
 * Owns the `http.Server` handle so we can:
 *   - Bind explicitly on `0.0.0.0` (helps in Docker).
 *   - Capture the resolved port (useful when PORT=0 in tests).
 *   - Drain in-flight connections on SIGTERM/SIGINT for graceful shutdown.
 */
import type { Server } from "node:http";
import type { Application } from "express";
import type { Logger } from "./lib/logger.js";

/**
 * Options accepted by `startServer`.
 */
export interface StartServerOptions {
  app: Application;
  port: number;
  logger: Logger;
  hostname?: string;
  /** Hard cap on graceful shutdown duration in ms. Default: 15_000. */
  shutdownTimeoutMs?: number;
}

/**
 * The handle returned by `startServer`. Exposes the underlying `Server`
 * so tests can close it, and a `close()` that performs the full graceful
 * shutdown sequence (stop accepting → drain → close prisma).
 */
export interface RunningServer {
  server: Server;
  port: number;
  close: () => Promise<void>;
}

/**
 * Start listening on the configured port. Returns a handle with a
 * `close()` that triggers a graceful shutdown.
 *
 * @param options Server start options.
 * @returns Running server handle.
 */
export const startServer = (options: StartServerOptions): Promise<RunningServer> => {
  const { app, port, logger, hostname = "0.0.0.0", shutdownTimeoutMs = 15_000 } = options;

  return new Promise((resolve, reject) => {
    const server = app.listen(port, hostname, () => {
      const addr = server.address();
      const resolvedPort =
        typeof addr === "object" && addr !== null && "port" in addr ? addr.port : port;
      logger.info({ port: resolvedPort, hostname }, "API listening");
      resolve({
        server,
        port: resolvedPort,
        close: () => gracefulClose(server, logger, shutdownTimeoutMs),
      });
    });

    server.on("error", (err) => {
      logger.error({ err }, "Failed to start HTTP server");
      reject(err);
    });
  });
};

/**
 * Graceful shutdown: stop accepting new connections, drain in-flight
 * requests, then close. Caps total wait at `timeoutMs`.
 *
 * @param server The http.Server handle.
 * @param logger Pino logger.
 * @param timeoutMs Hard cap on shutdown duration.
 */
const gracefulClose = (server: Server, logger: Logger, timeoutMs: number): Promise<void> => {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const timer = setTimeout(() => {
      logger.warn({ timeoutMs }, "Graceful shutdown timed out; forcing close.");
      server.closeAllConnections?.();
      finish();
    }, timeoutMs);
    timer.unref?.();

    server.close((err) => {
      if (err) {
        logger.error({ err }, "Error during server.close()");
      } else {
        logger.info("HTTP server closed cleanly.");
      }
      clearTimeout(timer);
      finish();
    });
  });
};
