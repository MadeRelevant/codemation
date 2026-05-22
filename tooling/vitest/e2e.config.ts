import path from "node:path";
import { defineConfig } from "vitest/config";

const p = (rel: string) => path.resolve(import.meta.dirname, rel);

export default defineConfig({
  test: {
    passWithNoTests: true,
    maxWorkers: 1,
    fileParallelism: false,
    projects: [p("../../packages/host/vitest.e2e.config.ts")],
  },
});
