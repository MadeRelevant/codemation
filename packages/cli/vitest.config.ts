import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@codemation/cli",
    root: import.meta.dirname,
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: ["**/*.integration.test.ts"],
    pool: "threads",
    testTimeout: 120_000,
  },
});
