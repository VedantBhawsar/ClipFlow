#!/usr/bin/env node
/**
 * Apply pending Prisma migrations to the running Postgres container.
 *
 * Two-state logic to coexist with neon_backup.sql:
 *   1. Probe: try `SELECT 1 FROM "users" LIMIT 1`. The `users` table is
 *      created by the very first migration (`20260622055536_init`) and is
 *      present in the dump, so its existence reliably tells us whether
 *      the schema was bootstrapped from neon_backup.sql.
 *   2. Schema missing → run `prisma migrate deploy` from scratch (every
 *      migration applied). This is the fresh-volume / fresh-DB path.
 *   3. Schema present → mark every existing migration as
 *      `applied` via `prisma migrate resolve --applied` (without re-running
 *      the SQL — that's the whole point). Then `migrate deploy` is a no-op
 *      except for any genuinely new migrations added after the dump.
 *
 * Invoked from packages/db/Dockerfile.migrate; also safe to run locally
 * via `node packages/db/scripts/migrate.mjs` for a quick sanity check.
 *
 * DATABASE_URL comes from the docker-compose env_file (or .env locally);
 * prisma.config.ts loads dotenv as a fallback for non-compose runs.
 */

import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const SCHEMA_PATH = "./schema.prisma";
const MIGRATIONS_DIR = "prisma/migrations";
// Probe target: created by the first migration and present in neon_backup.sql.
const PROBE_TABLE = "users";

const prisma = new PrismaClient();

async function hasSchema() {
  try {
    await prisma.$queryRawUnsafe(`SELECT 1 FROM "${PROBE_TABLE}" LIMIT 1`);
    return true;
  } catch (err) {
    // Postgres "relation does not exist" (42P01) — expected on fresh DB.
    // Anything else (auth, network) is a real error and we should surface it.
    const code = err?.code ?? err?.meta?.code;
    if (code === "42P01" || /does not exist/i.test(String(err?.message ?? ""))) {
      return false;
    }
    throw err;
  }
}

function runPrismaMigrate(args) {
  // execFileSync (not execSync) so shell metacharacters in args can't
  // trip a quoting bug — every arg is passed as its own argv entry.
  execFileSync("pnpm", ["exec", "prisma", "migrate", ...args, "--schema", SCHEMA_PATH], {
    stdio: "inherit",
  });
}

function listMigrationDirs() {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name !== "migration_lock.toml")
    .sort();
}

async function main() {
  const migrations = listMigrationDirs();
  if (migrations.length === 0) {
    console.error(`No migrations found under ${MIGRATIONS_DIR}/ — nothing to do.`);
    process.exit(0);
  }

  console.log(`==> Found ${migrations.length} migration(s). Probing schema…`);
  const schemaExists = await hasSchema();

  if (schemaExists) {
    console.log(`==> Schema already present (table "${PROBE_TABLE}" exists).`);
    console.log("==> Baselining existing migrations as applied (no SQL re-run)…");
    for (const name of migrations) {
      const sqlPath = join(MIGRATIONS_DIR, name, "migration.sql");
      try {
        runPrismaMigrate(["resolve", "--applied", name]);
        console.log(`    ✓ ${name}`);
      } catch (err) {
        // `migrate resolve --applied` throws if the migration is already in
        // the table from a previous run. Treat that as success — the row
        // is already there, which is exactly the state we wanted.
        if (/already recorded|already applied/i.test(String(err?.message ?? ""))) {
          console.log(`    · ${name} (already recorded)`);
          continue;
        }
        throw new Error(`Failed to baseline ${name}: ${err?.message ?? err}`);
      }
    }
  } else {
    console.log(`==> Fresh database (table "${PROBE_TABLE}" missing).`);
    console.log("==> Applying every migration from scratch…");
  }

  console.log("==> Running `prisma migrate deploy` for any pending migrations…");
  runPrismaMigrate(["deploy"]);
  console.log("==> Migrations complete.");
}

main()
  .catch((err) => {
    console.error("Migration run failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });