/**
 * Centralized, type-safe query key factory.
 *
 * Why a factory:
 *  - One place to see every cache slot the app reads from.
 *  - `invalidateQueries({ queryKey: queryKeys.settings.bundle() })`
 *    invalidates exactly the right key without string typos.
 *  - Trivial to bump a cache version (e.g. `["settings", "v2",
 *    "bundle"]`) on a schema change without grepping the codebase for
 *    string literals.
 *
 * Convention: keys are nested arrays ordered broad → narrow, all
 * lowercase. Helpers that take arguments include them as the trailing
 * segment.
 */
export const queryKeys = {
  /**
   * Lazy settings-shaped data fetched by the settings pages and the
   * YouTube connection card. The dashboard chrome no longer hydrates
   * from this on every render — it reads identity + onboarding
   * status directly from the NextAuth session JWT.
   */
  settings: {
    bundle: () => ["settings", "bundle"] as const,
    /** Narrow YouTube-connection read used by the YouTubeConnectCard. */
    youtubeConnection: () => ["settings", "youtube-connection"] as const,
  },
  onboarding: {
    status: () => ["onboarding", "status"] as const,
  },
  videos: {
    /**
     * Videos list cache slot. The trailing `params` segment lets the
     * dashboard's "non-published, page 1, q='minecraft'" query and the
     * published page's "PUBLISHED, page 3" query coexist in the cache
     * without colliding — TanStack Query's structural sharing keys on
     * the full array, so distinct filter tuples produce distinct slots.
     *
     * Typed as `unknown` rather than `Record<string, unknown>` so the
     * params interfaces (which have known keys and no index signature)
     * pass straight through without a cast.
     */
    list: (params: unknown = {}) => ["videos", "list", params] as const,
    /** PUBLISHED videos for the current user (sidebar destination). */
    published: (params: unknown = {}) =>
      ["videos", "published", params] as const,
    /** Single video by id. */
    detail: (id: string) => ["videos", "detail", id] as const,
  },
} as const;