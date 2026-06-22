import { describe, it, expect } from "vitest";
import {
  registerSchema,
  loginSchema,
  googleAuthSchema,
  passwordSchema,
} from "./auth.schemas.js";

describe("auth.schemas", () => {
  describe("passwordSchema", () => {
    it("accepts valid password with letter and number", () => {
      const result = passwordSchema.safeParse("Password123");
      expect(result.success).toBe(true);
    });

    it("rejects password shorter than 8 characters", () => {
      const result = passwordSchema.safeParse("Pass1");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result?.error?.issues[0]?.message).toBe(
          "Password must be at least 8 characters.",
        );
      }
    });

    it("rejects password without a letter", () => {
      const result = passwordSchema.safeParse("12345678");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result?.error?.issues[0]?.message).toBe(
          "Password must include at least one letter.",
        );
      }
    });

    it("rejects password without a number", () => {
      const result = passwordSchema.safeParse("PasswordOnly");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result?.error?.issues[0]?.message).toBe(
          "Password must include at least one number.",
        );
      }
    });

    it("rejects password longer than 128 characters", () => {
      const result = passwordSchema.safeParse("a".repeat(129));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result?.error?.issues[0]?.message).toBe(
          "Password must be at most 128 characters.",
        );
      }
    });
  });

  describe("registerSchema", () => {
    it("accepts valid registration input", () => {
      const result = registerSchema.safeParse({
        email: "test@example.com",
        password: "Password123",
      });
      expect(result.success).toBe(true);
    });

    it("accepts registration with optional name", () => {
      const result = registerSchema.safeParse({
        email: "test@example.com",
        password: "Password123",
        name: "John Doe",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid email", () => {
      const result = registerSchema.safeParse({
        email: "not-an-email",
        password: "Password123",
      });
      expect(result.success).toBe(false);
    });

    it("trims email whitespace but still validates as email", () => {
      const result = registerSchema.safeParse({
        email: " test@example.com ",
        password: "Password123",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("test@example.com");
      }
    });

    it("normalizes email to lowercase", () => {
      const result = registerSchema.safeParse({
        email: "Test@EXAMPLE.COM",
        password: "Password123",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("test@example.com");
      }
    });

    it("rejects weak password", () => {
      const result = registerSchema.safeParse({
        email: "test@example.com",
        password: "weak",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("loginSchema", () => {
    it("accepts valid login input", () => {
      const result = loginSchema.safeParse({
        email: "test@example.com",
        password: "Password123",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing password", () => {
      const result = loginSchema.safeParse({
        email: "test@example.com",
        password: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid email", () => {
      const result = loginSchema.safeParse({
        email: "not-an-email",
        password: "Password123",
      });
      expect(result.success).toBe(false);
    });

    it("normalizes email to lowercase", () => {
      const result = loginSchema.safeParse({
        email: "Test@EXAMPLE.COM",
        password: "Password123",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("test@example.com");
      }
    });
  });

  describe("googleAuthSchema", () => {
    it("accepts valid idToken", () => {
      const result = googleAuthSchema.safeParse({
        idToken: "some-google-id-token",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty idToken", () => {
      const result = googleAuthSchema.safeParse({
        idToken: "",
      });
      expect(result.success).toBe(false);
    });
  });
});
