import path from "node:path";
import { defineConfig } from "vitest/config";

const p = (rel: string) => path.resolve(import.meta.dirname, rel);

export default defineConfig({
  test: {
    maxWorkers: 2,
    fileParallelism: true,
    projects: [p("../../packages/host/vitest.ui.config.ts")],
  },
});
