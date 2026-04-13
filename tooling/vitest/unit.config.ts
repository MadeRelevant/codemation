import path from "node:path";
import { defineConfig } from "vitest/config";

const p = (rel: string) => path.resolve(import.meta.dirname, rel);

/**
 * Unit suite: core packages + next-host + @codemation/host Node-side *.test.ts + create-codemation.
 */
export default defineConfig({
  test: {
    maxWorkers: 2,
    fileParallelism: true,
    projects: [
      p("./vitest.tooling.config.ts"),
      p("../../packages/agent-skills/vitest.config.ts"),
      p("../../packages/core/vitest.config.ts"),
      p("../../packages/core-nodes/vitest.config.ts"),
      p("../../packages/core-nodes-gmail/vitest.config.ts"),
      p("../../packages/create-codemation/vitest.config.ts"),
      p("../../packages/cli/vitest.config.ts"),
      p("../../packages/next-host/vitest.config.ts"),
      p("../../packages/host/vitest.unit.config.ts"),
    ],
  },
});
