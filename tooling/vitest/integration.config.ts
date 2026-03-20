import path from "node:path";
import { defineConfig } from "vitest/config";

const p = (rel: string) => path.resolve(import.meta.dirname, rel);

export default defineConfig({
  test: {
    maxWorkers: 2,
    fileParallelism: true,
    projects: [p("../../packages/queue-bullmq/vitest.config.ts"), p("../../packages/frontend/vitest.integration.config.ts")],
  },
});
