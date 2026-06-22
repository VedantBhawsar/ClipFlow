/**
 * Database availability guard.
 *
 * Used by services that need Prisma to short-circuit with a 503 instead
 * of attempting to query a missing/stub DB. Centralized so the message
 * stays consistent.
 */
import { AppError } from "../errors/AppError.js";
import { isDatabaseAvailable } from "./prisma.js";

/**
 * Throw `AppError(503, "DATABASE_UNAVAILABLE", ...)` if the DB is not
 * configured. Otherwise, return without doing anything.
 *
 * @throws AppError with 503 status when DB is offline.
 */
export const requireDatabase = (): void => {
  if (!isDatabaseAvailable()) {
    throw new AppError(
      503,
      "DATABASE_UNAVAILABLE",
      "The database is not configured. Set DATABASE_URL and try again.",
    );
  }
};
