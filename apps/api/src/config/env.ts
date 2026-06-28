/**
 * Environment configuration loader.
 *
 * Thin wrapper over `@clipflow/config.loadEnv()` that:
 * 1. Tries to load env from `.env` if present (without throwing if absent).
 * 2. Validates with `@clipflow/config` (which throws on missing/invalid vars).
 * 3. In dev, tolerates a missing `DATABASE_URL` by falling back to a stub
 *    so the API can still boot for the frontend agent to verify the
 *    process starts. Routes that touch the DB fail with 503 instead of
 *    crashing the whole server.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnv } from "@clipflow/config";
import type { Env } from "@clipflow/config";
import { buildLogger } from "../lib/logger.js";

/**
 * Best-effort `.env` loader. Does NOT throw if the file is missing — env
 * may come from the orchestrating process instead. Only sets keys that
 * are not already defined in `process.env`.
 */
const loadDotEnvIfPresent = (): void => {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes if present.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
};

// Load `.env` as early as possible so workspace packages (e.g. `@clipflow/db`)
// that read `process.env` at import time see the values.
loadDotEnvIfPresent();

/**
 * Load and validate environment. In development, falls back to a
 * permissive stub if `DATABASE_URL` is missing so the API process can
 * boot for the frontend agent's sanity check — services that touch
 * Prisma will fail with 503 instead.
 *
 * @returns Validated env, plus a `databaseAvailable` flag indicating
 *   whether the real Prisma client should be used.
 */
export const loadApiEnv = (): { env: Env; databaseAvailable: boolean } => {
  loadDotEnvIfPresent();

  const isDev = process.env.NODE_ENV !== "production";

  // Dev fallback: stub DATABASE_URL so `@clipflow/config` validation passes
  // even when the frontend agent boots the API without a Postgres instance.
  if (isDev && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgresql://stub:stub@localhost:5432/stub";
  }

  try {
    const env = loadEnv();
    const databaseAvailable = isDev
      ? process.env.DATABASE_URL !== "postgresql://stub:stub@localhost:5432/stub"
      : true;

    // Surface config gaps that the boot banner would otherwise bury. We
    // log (not throw) so the operator still gets to see the banner and
    // the failure reasons themselves — the banner is the source of truth.
    if (!databaseAvailable || !env.REDIS_URL) {
      const log = buildLogger(env);
      if (!databaseAvailable) {
        log.warn(
          "DATABASE_URL is not set; Prisma will not be initialized. Routes that touch the DB will return 503.",
        );
      }
      if (!env.REDIS_URL) {
        log.warn(
          env.NODE_ENV === "production"
            ? "REDIS_URL is not set in production — cache will fall back to in-memory (per-process) and publish jobs cannot be enqueued. Set REDIS_URL before deploying."
            : "REDIS_URL is not set; cache will use the in-memory fallback and the publish queue will be disabled.",
        );
      }
    }

    return { env, databaseAvailable };
  } catch (error) {
    // Re-throw but with extra context.
    const message = error instanceof Error ? error.message : "Unknown env load failure";
    throw new Error(`Environment validation failed: ${message}`);
  }
};

