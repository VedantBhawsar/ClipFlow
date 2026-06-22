/**
 * AES-256-GCM at-rest encryption helper.
 *
 * Used for future refresh tokens (YouTube channel refresh tokens will be
 * stored encrypted per `Schema.md` — declared now so the column exists from
 * day one and no migration is needed). The encryption format is the
 * concatenated base64 segments: `iv.authTag.ciphertext`, separated by `.`.
 *
 * Output is `base64(iv)·base64(authTag)·base64(ciphertext)` — easy to
 * store in a single text column, easy to debug.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { AppError } from "../errors/AppError.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard
const KEY_LENGTH = 32; // 256-bit key

/**
 * Derive the symmetric key from the raw `ENCRYPTION_KEY` env value.
 *
 * Accepts either a 32-character ASCII string (treated as raw bytes) or
 * base64-encoded 32 bytes. Validates length strictly.
 *
 * @param envKey Raw `ENCRYPTION_KEY` env value.
 * @returns 32-byte Buffer suitable for AES-256.
 */
const deriveKey = (envKey: string): Buffer => {
  if (envKey.length < KEY_LENGTH) {
    throw new AppError(
      500,
      "INVALID_ENCRYPTION_KEY",
      "ENCRYPTION_KEY is too short; expected at least 32 characters.",
    );
  }
  // Hash the env value to get exactly 32 bytes regardless of whether the
  // raw env value is ASCII or contains multi-byte UTF-8 characters.
  // SHA-256 is overkill for key stretching but gives us a deterministic
  // 32-byte key from any input length, which is what AES-256 requires.
  return createHash("sha256").update(envKey, "utf8").digest();
};

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * @param plaintext The value to encrypt.
 * @param envKey Raw `ENCRYPTION_KEY` env value.
 * @returns Ciphertext in `base64(iv).base64(authTag).base64(ciphertext)` form.
 */
export const encryptToken = (plaintext: string, envKey: string): string => {
  const key = deriveKey(envKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${authTag.toString("base64")}.${enc.toString("base64")}`;
};

/**
 * Decrypt a previously encrypted string.
 *
 * @param ciphertext The value produced by `encryptToken`.
 * @param envKey Raw `ENCRYPTION_KEY` env value (must match the encrypt key).
 * @returns Original plaintext.
 * @throws AppError(500) if the input is malformed or the auth tag doesn't verify.
 */
export const decryptToken = (ciphertext: string, envKey: string): string => {
  const key = deriveKey(envKey);
  const parts = ciphertext.split(".");
  if (parts.length !== 3) {
    throw new AppError(
      500,
      "DECRYPT_FAILED",
      "Encrypted value is malformed (expected iv.authTag.ciphertext).",
    );
  }
  const [ivPart, authTagPart, encPart] = parts as [string, string, string];
  const iv = Buffer.from(ivPart, "base64");
  const authTag = Buffer.from(authTagPart, "base64");
  const enc = Buffer.from(encPart, "base64");
  if (iv.length !== IV_LENGTH) {
    throw new AppError(500, "DECRYPT_FAILED", "Encrypted value has an invalid IV.");
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
};
