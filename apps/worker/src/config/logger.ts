/**
 * Pino logger factory for the worker. Mirrors apps/api's logger shape
 * so log lines from both processes look the same.
 */
import { pino } from "pino";

export const buildLogger = () => {
  const isDev = process.env.NODE_ENV !== "production";
  return pino({
    level: isDev ? "debug" : "info",
    base: { service: "clipflow-worker" },
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