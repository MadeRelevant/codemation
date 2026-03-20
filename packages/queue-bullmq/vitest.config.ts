import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@codemation/queue-bullmq",
    root: import.meta.dirname,
    environment: "node",
    include: ["test/**/*.test.ts"],
    pool: "threads",
    testTimeout: 180_000,
  },
  resolve: {
    conditions: ["development", "import", "module", "default"],
  },
});
