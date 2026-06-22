/**
 * Tiny cache abstraction.
 *
 * In-memory Map + TTL today. The interface is intentionally async so that
 * swapping to Redis is a one-file change (`apps/api/src/lib/cache.ts`)
 * without touching any call site.
 *
 * Currently used to short-circuit `GET /api/auth/me` for 30s per user
 * (low-priority optimization, but wired so the abstraction is proven).
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
   * Stop the background sweeper. Call from graceful shutdown.
   */
  public dispose(): void {
    if (this.sweeper) {
      clearInterval(this.sweeper);
      this.sweeper = null;
    }
  }
}

/**
 * Singleton cache instance. Swap this out for a Redis-backed client when
 * `REDIS_URL` is present.
 */
export const cache: CacheClient = new InMemoryCache();

/**
 * Helper to dispose the in-memory cache's background sweeper. Called from
 * graceful shutdown so the process can exit cleanly.
 */
export const disposeCache = (): void => {
  if (cache instanceof InMemoryCache) {
    cache.dispose();
  }
};
