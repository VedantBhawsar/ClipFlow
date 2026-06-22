import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: [
      "lib/**/*.test.ts",
      "lib/**/*.test.tsx",
      "components/**/*.test.ts",
      "components/**/*.test.tsx",
      "hooks/**/*.test.ts",
    ],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: [
        "lib/**/*.ts",
        "lib/**/*.tsx",
        "components/auth/**/*.tsx",
        "components/onboarding/**/*.tsx",
        "components/dashboard/**/*.tsx",
        "components/settings/**/*.tsx",
        "components/ui/**/*.tsx",
        "hooks/**/*.ts",
      ],
    },
  },
});
