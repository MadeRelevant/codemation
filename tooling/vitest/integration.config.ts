import path from "node:path";
import { defineConfig } from "vitest/config";

const p = (rel: string) => path.resolve(import.meta.dirname, rel);

export default defineConfig({
  test: {
    maxWorkers: 1,
    fileParallelism: false,
    projects: [
      p("../../packages/host/vitest.integration.config.ts"),
      p("../../packages/cli/vitest.integration.config.ts"),
    ],
  },
});
