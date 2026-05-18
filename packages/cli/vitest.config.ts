import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    conditions: ["development"],
  },
  test: {
    name: "@codemation/cli",
    root: import.meta.dirname,
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: ["**/*.integration.test.ts"],
    pool: "threads",
    testTimeout: 120_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/index.ts", "src/**/*.types.ts", "src/bin.ts"],
      thresholds: {
        lines: 40,
        functions: 45,
        branches: 40,
      },
    },
  },
});
