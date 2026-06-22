/**
 * Crypto self-test.
 *
 * Encrypts then decrypts a sample string and asserts the round-trip
 * succeeded. Useful as a one-shot smoke test in CI and after bumping
 * `ENCRYPTION_KEY` rotation logic.
 *
 * Reads `ENCRYPTION_KEY` from `process.env`; falls back to a known
 * 32-character dev key if absent. Exits non-zero on any failure.
 */
import { encryptToken, decryptToken } from "../lib/crypto.js";

const FALLBACK_KEY = "dev-encryption-key-replace-me-32-chars";

const main = (): void => {
  const key = process.env.ENCRYPTION_KEY ?? FALLBACK_KEY;
  const samples = [
    "hello-clipflow",
    "",
    "longer-string-with-unicode-éèê-🚀",
    "special=chars+with/slashes&and?query=strings",
  ];

  let failed = 0;
  for (const sample of samples) {
    try {
      const ciphertext = encryptToken(sample, key);
      const recovered = decryptToken(ciphertext, key);
      if (recovered !== sample) {
        // eslint-disable-next-line no-console
        console.error(
          `MISMATCH: encrypt+decrypt of "${sample}" produced "${recovered}".`,
        );
        failed++;
        continue;
      }
      if (sample !== "" && ciphertext === sample) {
        // eslint-disable-next-line no-console
        console.error(`Ciphertext equals plaintext for "${sample}" — encryption did not run.`);
        failed++;
        continue;
      }
      // eslint-disable-next-line no-console
      console.log(`OK: round-trip for ${JSON.stringify(sample)} → ${ciphertext.length} chars`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`FAILED: ${JSON.stringify(sample)}:`, err);
      failed++;
    }
  }

  // Tampering with the auth tag should fail to decrypt.
  try {
    const ciphertext = encryptToken("verify-auth-tag", key);
    const parts = ciphertext.split(".");
    if (parts.length !== 3) {
      throw new Error("Ciphertext format unexpected.");
    }
    const [iv, authTag, enc] = parts as [string, string, string];
    const tampered = `${iv}.${authTag.slice(0, -1)}A.${enc}`;
    try {
      decryptToken(tampered, key);
      // eslint-disable-next-line no-console
      console.error("FAILED: tampered auth tag should not decrypt.");
      failed++;
    } catch {
      // eslint-disable-next-line no-console
      console.log("OK: tampered auth tag rejected.");
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("FAILED: tampered auth tag test threw unexpectedly:", err);
    failed++;
  }

  if (failed > 0) {
    // eslint-disable-next-line no-console
    console.error(`\n${failed} crypto self-test failure(s).`);
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log("\nAll crypto self-tests passed.");
};

main();
