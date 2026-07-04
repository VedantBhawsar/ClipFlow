import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import 'dotenv/config'; 

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
    max: 10,
    min: 1,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: ["warn", "error"],
  });
}

export const prisma: PrismaClient =
  globalThis.__clipflowPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__clipflowPrisma = prisma;
}

export * from "@prisma/client";