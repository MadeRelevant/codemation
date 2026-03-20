import path from "node:path";
import { defineConfig } from "vitest/config";

const p = (rel: string) => path.resolve(import.meta.dirname, rel);

/**
 * Unit suite: core packages + next-host + frontend Node-side *.test.ts.
 */
export default defineConfig({
  test: {
    maxWorkers: 2,
    fileParallelism: true,
    projects: [
      p("../../packages/core/vitest.config.ts"),
      p("../../packages/core-nodes/vitest.config.ts"),
      p("../../packages/core-nodes-gmail/vitest.config.ts"),
      p("../../packages/next-host/vitest.config.ts"),
      p("../../packages/frontend/vitest.unit.config.ts"),
    ],
  },
});
