import { defineConfig } from "vitest/config";

/**
 * Fast unit tests for @codemation/queue-bullmq (included from root `test:unit`).
 * Redis/BullMQ e2e tests stay on {@link ./vitest.config.ts} for the integration suite.
 */
export default defineConfig({
  test: {
    name: "@codemation/queue-bullmq-unit",
    root: import.meta.dirname,
    environment: "node",
    include: ["test/redisConnectionOptionsFactory.test.ts"],
    pool: "threads",
  },
  resolve: {
    conditions: ["development", "import", "module", "default"],
  },
});
