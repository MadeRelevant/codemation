import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@codemation/core-nodes-gmail",
    root: import.meta.dirname,
    environment: "node",
    include: ["test/**/*.test.ts"],
    pool: "threads",
    testTimeout: 120_000,
  },
  resolve: {
    conditions: ["development", "import", "module", "default"],
  },
});
