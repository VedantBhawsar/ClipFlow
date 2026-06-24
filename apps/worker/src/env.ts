/**
 * Worker environment loader.
 *
 * Reuses `@clipflow/config.loadEnv` and then asserts that REDIS_URL
 * is set — the worker cannot function without Redis (BullMQ needs a
 * broker). In dev, if the URL isn't supplied, we provide a default
 * pointing at localhost so the file boots with zero config.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnv } from "@clipflow/config";
import type { Env } from "@clipflow/config";

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

/**
 * Load + validate env. Asserts REDIS_URL is present because BullMQ
 * needs a broker.
 */
export const loadWorkerEnv = (): Env => {
  loadDotEnvIfPresent();
  if (!process.env.REDIS_URL) {
    // Dev convenience: default to localhost Redis. Production must
    // supply REDIS_URL explicitly via env / compose.
    process.env.REDIS_URL = "redis://localhost:6379";
  }
  const env = loadEnv();
  if (!env.REDIS_URL) {
    throw new Error(
      "REDIS_URL must be set for the worker — BullMQ requires a Redis broker.",
    );
  }
  return env;
};