/**
 * Zod schemas for auth routes.
 *
 * Defines the wire-format validators used by the `validate` middleware.
 * Password rule (min 8 chars, at least one letter and one number) is
 * enforced here; failures surface as 400 with field-level details from
 * the central error handler.
 */
import { z } from "zod";

/**
 * Password rule: minimum 8 characters, at least one letter and one number.
 * Exposed as a refinement so the message stays consistent across endpoints.
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be at most 128 characters.")
  .refine((v) => /[A-Za-z]/.test(v), {
    message: "Password must include at least one letter.",
  })
  .refine((v) => /\d/.test(v), {
    message: "Password must include at least one number.",
  });

/**
 * Body schema for `POST /api/auth/register`.
 */
export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address."),
  password: passwordSchema,
  name: z.string().trim().min(1).max(120).optional(),
});

/**
 * Body schema for `POST /api/auth/login`.
 */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

/**
 * Body schema for `POST /api/auth/google`. Stub for now (see
 * `auth.service.googleSignIn`); just validates the field exists.
 */
export const googleAuthSchema = z.object({
  idToken: z.string().min(1, "Google idToken is required."),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;
