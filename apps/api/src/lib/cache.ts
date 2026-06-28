/**
 * Cache abstraction.
 *
 * Two backends share one interface:
 *   - `RedisCacheClient`  → production + any environment with REDIS_URL
 *   - `InMemoryCache`     → dev fallback when REDIS_URL is unset; also the
 *                            default for unit tests that never call initCache()
 *
 * `initCache(env)` is called once at boot from `index.ts` and picks the
 * backend from `env.REDIS_URL`. The exported `cache` object delegates to the
 * active backend, so existing call sites (`cache.get/set/del`) stay
 * unchanged. Tests that mock this module with `vi.mock("../../lib/cache.js")`
 * keep working because the mock replaces the whole module surface.
 *
 * `connectCache()` + `disconnectCache()` are the lifecycle hooks called from
 * `index.ts`. `connectCache()` PINGs Redis so a misconfigured REDIS_URL
 * surfaces at startup, not on the first request.
 */
import { Redis } from "ioredis";
import type { Env } from "@clipflow/config";

/**
 * Cache contract used by every consumer. Async on purpose so the swap from
 * in-memory to a network client is invisible at call sites.
 */
export interface CacheClient {
  /**
   * Get a cached value.
   *
   * @param key Cache key.
   * @returns Cached string, or `null` if missing/expired.
   */
  get(key: string): Promise<string | null>;

  /**
   * Set a cached value with a TTL.
   *
   * @param key Cache key.
   * @param value Value to store (strings only at this layer; JSON-stringify
   *   if you need structured data).
   * @param ttlSeconds Time-to-live in seconds.
   */
  set(key: string, value: string, ttlSeconds: number): Promise<void>;

  /**
   * Delete a cached value. No-op if missing.
   *
   * @param key Cache key.
   */
  del(key: string): Promise<void>;
}

interface Entry {
  value: string;
  expiresAt: number;
}

/**
 * In-memory implementation backed by a `Map`. Suitable for single-process
 * deployments. Entries are evicted lazily on read and periodically via a
 * background sweeper to bound memory.
 */
class InMemoryCache implements CacheClient {
  private readonly store = new Map<string, Entry>();
  private sweeper: NodeJS.Timeout | null = null;

  constructor() {
    // Sweep every minute to bound memory from TTL-expired-but-unread entries.
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    // Don't keep the event loop alive solely for the sweeper.
    this.sweeper.unref?.();
  }

  public async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  public async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  public async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Stop the background sweeper. Called from graceful shutdown.
   */
  public dispose(): void {
    if (this.sweeper) {
      clearInterval(this.sweeper);
      this.sweeper = null;
    }
  }
}

/**
 * Redis-backed implementation. Uses ioredis with `lazyConnect: true` so we
 * can fail fast at boot via `connect()` rather than on the first cache call.
 *
 * `maxRetriesPerRequest: null` is required for BullMQ compatibility — we
 * use the same ioredis options the queue does so either client could
 * theoretically be reused for queueing later.
 */
class RedisCacheClient implements CacheClient {
  private readonly redis: Redis;
  private connected = false;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      // Surface errors to stderr rather than throwing — boot-time connect()
      // is the authoritative check.
    });
    this.redis.on("error", (err) => {
      // Logged at the point of failure (typically connect() / first command).
      // ioredis emits `error` on socket-level failures; we don't want the
      // process to crash mid-flight.
      console.error("[cache] redis error:", err.message);
    });
  }

  /**
   * Connect + PING. Throws on unreachable Redis so boot fails fast.
   */
  public async connect(): Promise<void> {
    if (this.connected) return;
    await this.redis.connect();
    const pong = await this.redis.ping();
    if (pong !== "PONG") {
      await this.redis.quit().catch(() => undefined);
      throw new Error(`Redis PING returned unexpected response: ${pong}`);
    }
    this.connected = true;
  }

  public async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  public async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    // Atomic SET ... EX — survives a process restart mid-flight.
    await this.redis.set(key, value, "EX", ttlSeconds);
  }

  public async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  /**
   * Graceful shutdown — sends QUIT so the server side closes the socket
   * cleanly. Falls back to `disconnect()` on a hanging server.
   */
  public async disconnect(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
    this.connected = false;
  }
}

/**
 * The active backend singleton. Null until `initCache(env)` runs. We expose
 * a delegating `cache` object below so existing call sites (`cache.get/set/del`)
 * keep working without knowing which backend is active.
 */
let instance: CacheClient | null = null;

/**
 * Pick the backend from env and return the active instance. Idempotent —
 * repeated calls return the same instance.
 *
 * @param env Validated env.
 * @returns The active cache client.
 */
export const initCache = (env: Env): CacheClient => {
  if (instance) return instance;
  instance = env.REDIS_URL ? new RedisCacheClient(env.REDIS_URL) : new InMemoryCache();
  return instance;
};

/**
 * Return the active instance, lazily constructing the in-memory fallback if
 * `initCache()` was never called. Keeps legacy behavior for tests that
 * exercise the cache without booting the full API.
 */
const ensureInstance = (): CacheClient => {
  if (!instance) instance = new InMemoryCache();
  return instance;
};

/**
 * Singleton used by every consumer. Methods delegate to the active backend.
 * Tests that mock this module replace the entire export, so the delegation
 * here never runs in test code paths.
 */
export const cache: CacheClient = {
  get: (key) => ensureInstance().get(key),
  set: (key, value, ttlSeconds) => ensureInstance().set(key, value, ttlSeconds),
  del: (key) => ensureInstance().del(key),
};

/**
 * Which backend is currently active. Used by the boot banner to log which
 * cache layer is wired in.
 *
 * @returns `"redis"` if REDIS_URL was provided, otherwise `"memory"`.
 */
export const getCacheBackend = (): "redis" | "memory" =>
  instance instanceof RedisCacheClient ? "redis" : "memory";

/**
 * Verify the cache is reachable. Called once at boot from `index.ts` so a
 * misconfigured Redis URL surfaces as a clear startup error rather than a
 * confusing request-time 500. For the in-memory backend this is a no-op.
 *
 * @param env Validated env.
 * @returns `{ ok: true, backend, latencyMs }` on success, otherwise
 *   `{ ok: false, backend, error }`.
 */
export const verifyCache = async (
  env: Env,
): Promise<
  | { ok: true; backend: "redis" | "memory"; latencyMs: number }
  | { ok: false; backend: "redis" | "memory"; error: string }
> => {
  const backend: "redis" | "memory" = env.REDIS_URL ? "redis" : "memory";
  if (!env.REDIS_URL) {
    // In-memory is always reachable — there's no network to fail.
    initCache(env);
    return { ok: true, backend, latencyMs: 0 };
  }
  const start = Date.now();
  try {
    initCache(env);
    const client = ensureInstance();
    if (client instanceof RedisCacheClient) {
      await client.connect();
    }
    return { ok: true, backend, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      backend,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

/**
 * Disconnect the active cache on graceful shutdown. Safe to call when the
 * backend is the in-memory fallback (the inner `dispose()` is a no-op for
 * the in-memory case except for the sweeper, which we still want cleared).
 */
export const disposeCache = async (): Promise<void> => {
  const client = instance;
  if (!client) return;
  if (client instanceof RedisCacheClient) {
    await client.disconnect();
  } else if (client instanceof InMemoryCache) {
    client.dispose();
  }
};
