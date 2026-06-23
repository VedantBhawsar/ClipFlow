import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __clipflowPrisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const pool = new pg.Pool({
    connectionString,
    // Fail fast when Neon serverless compute is cold-starting instead of
    // hanging for 10–20 s on the first connection.
    connectionTimeoutMillis: 5_000,
    // Don't hold connections open indefinitely when idle.
    idleTimeoutMillis: 30_000,
  });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });
}

export const prisma: PrismaClient =
  globalThis.__clipflowPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__clipflowPrisma = prisma;
}

export * from "@prisma/client";