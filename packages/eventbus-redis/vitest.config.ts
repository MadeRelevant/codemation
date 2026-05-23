import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Redirect ioredis imports to the in-process fake during tests.
      // This is resolve-level aliasing — not vi.mock() — so it is permitted by ESLint rules.
      ioredis: path.resolve(import.meta.dirname, "test/__mocks__/ioredis.ts"),
    },
  },
  test: {
    name: "@codemation/eventbus-redis",
    root: import.meta.dirname,
    environment: "node",
    include: ["test/**/*.test.ts"],
    pool: "threads",
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 75,
      },
    },
  },
});
