import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@codemation/managed-auth",
    root: import.meta.dirname,
    environment: "node",
    include: ["test/**/*.test.ts"],
    pool: "threads",
    testTimeout: 30_000,
  },
  resolve: {
    conditions: ["development", "import", "module", "default"],
  },
});
