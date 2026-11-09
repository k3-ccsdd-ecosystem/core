import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["gate-checker/test/**/*.test.ts", "scripts/test/**/*.test.ts"],
    testTimeout: 30000,
  },
});
