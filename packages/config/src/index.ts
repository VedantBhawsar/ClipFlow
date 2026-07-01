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
  /// Access-token lifetime. Short by design — the refresh-token rotation
  /// flow picks up when this expires.
  JWT_EXPIRES_IN: z.string().default("15m"),
  /// Refresh-token lifetime. Long enough to be forgiving of short
  /// absences, short enough that a stolen refresh token is bounded.
  REFRESH_TOKEN_EXPIRES_IN: z.string().default("7d"),

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

  // S3 / MinIO / Cloudflare R2 (used for the upload-publish slice).
  // Same SDK config works against MinIO and R2 — only S3_ENDPOINT and
  // S3_FORCE_PATH_STYLE change between them.
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),

  // BullMQ (used by API for enqueue, by worker for consume).
  // Optional in API dev — enqueue becomes a 503 when missing. The worker
  // asserts it's set at boot.
  BULLMQ_PREFIX: z.string().default("clipflow"),

  // YouTube limits (defaults match PRD.md 60min / 5GB).
  YOUTUBE_CATEGORY_DEFAULT: z.string().regex(/^\d{1,2}$/).default("22"),
  YOUTUBE_MAX_VIDEO_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 1024 * 1024 * 1024),
  YOUTUBE_PRESIGNED_POST_TTL: z.coerce.number().int().positive().default(900),

  // FFmpeg path for the video-ingest worker (only used by apps/worker).
  // Defaults to "ffmpeg" so it is found on PATH.
  FFMPEG_PATH: z.string().min(1).default("ffmpeg"),

  // Transcription + LLM (v1.5 pipeline — topic-aware highlight selection).
  // Both are optional at config-load time so the worker can boot in dev
  // without them; the `transcription` and `generate` workers fail fast at
  // runtime with a typed error if the relevant key is missing. Mirrors the
  // pattern used for REDIS_URL (optional here, required for queue jobs)
  // and GOOGLE_CLIENT_ID (optional here, required for YouTube OAuth).
  /// AssemblyAI key. Used by the `transcription` worker only.
  ASSEMBLYAI_API_KEY: z.string().min(20).optional(),
  /// Which LLM provider the `generate` worker talks to.
  ///
  /// - `nvidia` (default) — OpenAI SDK pointed at NVIDIA's NIM endpoint
  ///   (`NVIDIA_BASE_URL`). NVIDIA's NIM is OpenAI-compatible, so the
  ///   same `openai` npm package works. Required key: `NVIDIA_API_KEY`.
  /// - `openai` — OpenAI SDK pointed at api.openai.com. Required key:
  ///   `OPENAI_API_KEY`.
  /// - `claude` — Reserved for a future Anthropic SDK adapter; not
  ///   implemented in the v1.5 slice.
  LLM_PROVIDER: z.enum(["claude", "openai", "nvidia"]).default("nvidia"),
  /// Anthropic API key. Required when LLM_PROVIDER=claude.
  ANTHROPIC_API_KEY: z.string().min(20).optional(),
  /// OpenAI API key. Required when LLM_PROVIDER=openai.
  OPENAI_API_KEY: z.string().min(20).optional(),
  /// NVIDIA API key (NIM). Required when LLM_PROVIDER=nvidia.
  NVIDIA_API_KEY: z.string().min(20).optional(),
  /// NVIDIA NIM base URL. Override only for self-hosted NIM or a
  /// different region; the default is the public integrate endpoint
  /// that hosts Llama 3.1 / Nemotron / Mixtral on OpenAI-compatible
  /// request/response shapes.
  NVIDIA_BASE_URL: z
    .string()
    .url()
    .default("https://integrate.api.nvidia.com/v1"),
  /// Default model id — provider-specific. Defaults to Llama 3.1 70B
  /// on NVIDIA NIM (good JSON-mode reliability, ~70B params ≈ Claude
  /// Sonnet quality on structured output). Override via env when
  /// A/B testing larger / smaller models.
  LLM_MODEL: z.string().default("meta/llama-3.1-70b-instruct"),
  /// Poll interval for `transcripts.waitUntilReady`. 2 s is AssemblyAI's
  /// sweet spot — more frequent burns rate-limit headroom.
  TRANSCRIBE_POLL_MS: z.coerce.number().int().positive().default(2_000),
  /// Hard ceiling on the transcription poll loop. A 60-min video takes
  /// ~3 min; 15 min leaves room for re-queues on a contended queue.
  TRANSCRIBE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60_000),

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