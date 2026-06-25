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
    /** All videos for the current user. */
    list: () => ["videos", "list"] as const,
    /** PUBLISHED videos for the current user (sidebar destination). */
    published: () => ["videos", "published"] as const,
    /** Single video by id. */
    detail: (id: string) => ["videos", "detail", id] as const,
  },
} as const;