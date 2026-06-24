/**
 * Centralized, type-safe query key factory.
 *
 * Why a factory:
 *  - One place to see every cache slot the app reads from.
 *  - `invalidateQueries({ queryKey: queryKeys.user.bundle() })` invalidates
 *    exactly the right key without string typos.
 *  - Trivial to bump a cache version (e.g. `["user", "v2", "bundle"]`) on
 *    a schema change without grepping the codebase for string literals.
 *
 * Convention: keys are nested arrays ordered broad → narrow, all lowercase.
 * Helpers that take arguments include them as the trailing segment.
 */
export const queryKeys = {
  user: {
    /** The full bundle used by AuthProvider + the dashboard chrome. */
    bundle: () => ["user", "bundle"] as const,
    /** Narrow YouTube-connection read used by /settings/connected. */
    youtubeConnection: () => ["user", "youtube-connection"] as const,
  },
  onboarding: {
    status: () => ["onboarding", "status"] as const,
  },
  videos: {
    /** All videos for the current user. */
    list: () => ["videos", "list"] as const,
    /** Single video by id. */
    detail: (id: string) => ["videos", "detail", id] as const,
  },
} as const;
