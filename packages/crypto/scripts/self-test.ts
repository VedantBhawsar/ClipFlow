/**
 * Self-test: round-trip AES-256-GCM encrypt/decrypt.
 * Mirrors the shape of apps/api's old crypto:self-test so the existing
 * command (`pnpm --filter api crypto:self-test`) still works after we
 * delete the api script in favor of `@clipflow/crypto`.
 */
import { encryptToken, decryptToken } from "../src/index.js";

const KEY = "dev-encryption-key-replace-me-32-chars";

const cases = [
  "short",
  "a".repeat(1024),
  "unicode: ✓ 你好 🔥",
  JSON.stringify({ token: "ya29.abc", exp: 1700000000 }),
];

let failed = 0;
for (const c of cases) {
  const enc = encryptToken(c, KEY);
  const dec = decryptToken(enc, KEY);
  const ok = dec === c;
  console.log(`${ok ? "✓" : "✗"} round-trip ${c.length} bytes`);
  if (!ok) {
    console.log(`  expected: ${c}`);
    console.log(`  got:      ${dec}`);
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`\n${failed} case(s) failed`);
  process.exit(1);
}

console.log("\nAll round-trips passed.");