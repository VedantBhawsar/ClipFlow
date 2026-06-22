/**
 * Password hashing helpers.
 *
 * bcrypt with 12 rounds. 12 is the common production sweet spot — strong
 * enough to resist offline attack at the cost of ~250ms per hash on modern
 * hardware. Don't lower this without a security review.
 */
import bcrypt from "bcrypt";

const BCRYPT_ROUNDS = 12;

/**
 * Hash a plaintext password.
 *
 * @param plaintext Raw password from the user.
 * @returns bcrypt hash suitable for storage.
 */
export const hashPassword = (plaintext: string): Promise<string> => {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
};

/**
 * Verify a plaintext password against a stored bcrypt hash.
 *
 * @param plaintext Raw password from the user.
 * @param hash Previously stored bcrypt hash.
 * @returns `true` if the password matches, `false` otherwise.
 */
export const verifyPassword = (plaintext: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(plaintext, hash);
};
