/**
 * Prisma client re-export.
 *
 * Re-exports the shared singleton from `@clipflow/db`. The
 * `PrismaClient` constructor is lazy — it doesn't connect to Postgres
 * until the first query, so constructing it with a stub `DATABASE_URL`
 * doesn't crash the process. Services that need the DB should still
 * check `isDatabaseAvailable()` (set from `index.ts` after env
 * validation) and return a 503 if the DB is intentionally offline.
 */
export { prisma } from "@clipflow/db";

let databaseAvailable = false;

/**
 * Tell the prisma module whether the DB should be considered available.
 * Called once from `index.ts` after env validation. Service code can
 * call `isDatabaseAvailable()` to short-circuit with a 503 instead of
 * attempting to query a stub DB.
 *
 * @param flag `true` if `DATABASE_URL` points at a real database.
 */
export const setDatabaseAvailable = (flag: boolean): void => {
  databaseAvailable = flag;
};

/**
 * Returns whether the DB is currently considered available.
 *
 * @returns `true` if `setDatabaseAvailable(true)` has been called.
 */
export const isDatabaseAvailable = (): boolean => databaseAvailable;
