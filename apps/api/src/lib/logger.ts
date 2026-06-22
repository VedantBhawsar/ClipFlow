/**
 * Structured logger (pino). The single source of truth for application
 * logging — every other module imports from here. Avoids `console.log` in
 * app code so output stays machine-parseable and consistent across local
 * dev, CI, and production.
 */
import { pino } from "pino";
import type { Env } from "@clipflow/config";

/**
 * Build the pino logger instance.
 *
 * @param env Validated environment object from `@clipflow/config`.
 * @returns Configured pino logger.
 */
export const buildLogger = (env: Pick<Env, "NODE_ENV">) => {
  const isDev = env.NODE_ENV !== "production";
  return pino({
    level: isDev ? "debug" : "info",
    base: { service: "clipflow-api" },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(isDev
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "SYS:standard",
              ignore: "pid,hostname,service",
            },
          },
        }
      : {}),
  });
};

export type Logger = ReturnType<typeof buildLogger>;
