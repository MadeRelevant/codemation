import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@codemation/core-nodes",
    root: import.meta.dirname,
    environment: "node",
    include: ["test/**/*.test.ts"],
    pool: "threads",
    testTimeout: 120_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/index.ts", "src/**/*.types.ts", "src/register.types.ts"],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 65,
      },
    },
  },
  resolve: {
    conditions: ["development", "import", "module", "default"],
  },
});
