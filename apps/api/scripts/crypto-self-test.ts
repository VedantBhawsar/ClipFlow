/**
 * AES-256-GCM round-trip self-test.
 *
 * Thin shim over `@clipflow/crypto/scripts/self-test.ts` so the
 * documented `pnpm --filter api crypto:self-test` command keeps working
 * after we moved the encryption helpers into a shared package.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const target = resolve(
  import.meta.dirname,
  "../../../packages/crypto/scripts/self-test.ts",
);

const result = spawnSync("pnpm", ["exec", "tsx", target], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);