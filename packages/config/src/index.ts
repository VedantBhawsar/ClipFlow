/**
 * @clipflow/config
 *
 * Validated environment configuration. Imported by both apps/api and apps/worker
 * (and indirectly by apps/web for `NEXT_PUBLIC_*` vars). Fail fast on boot if
 * anything required is missing or malformed — never let the process come up
 * with a half-configured environment.
 */
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Server
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),

  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Cache / queue (optional in dev — in-memory fallback when absent)
  REDIS_URL: z.string().url().optional(),

  // Auth secrets
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),

  // 32-byte base64 key for AES-256-GCM at-rest encryption (used for
  // refresh tokens later). Declared now so the column exists from day one
  // and no migration is needed when YouTube OAuth ships.
  ENCRYPTION_KEY: z
    .string()
    .min(32, "ENCRYPTION_KEY must be at least 32 characters"),

  // Google OAuth (used for YouTube channel connect in Step 6; declared now
  // so env validation is forward-compatible).
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),

  // Rate limiting (per-IP defaults; tighten per-route later)
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates and returns a typed env object. Throws with field-level detail
 * on failure so misconfiguration is loud, not silent.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("❌ Invalid environment variables:");
    // eslint-disable-next-line no-console
    console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
    throw new Error("Invalid environment variables");
  }
  return parsed.data;
}

/**
 * Public env (safe to expose to the browser). Whitelist only.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.string().url().default("http://localhost:4000"),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export function loadPublicEnv(source: Record<string, unknown> = {}): PublicEnv {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_API_BASE_URL:
      source.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL,
  });
  if (!parsed.success) {
    throw new Error("Invalid public environment variables");
  }
  return parsed.data;
}