import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@codemation/runtime-dev",
    root: import.meta.dirname,
    environment: "node",
    include: ["test/**/*.test.ts"],
    pool: "threads",
    testTimeout: 120_000,
  },
});
