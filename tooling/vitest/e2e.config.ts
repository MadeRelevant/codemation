import path from "node:path";
import { defineConfig } from "vitest/config";

const p = (rel: string) => path.resolve(import.meta.dirname, rel);

export default defineConfig({
  test: {
    passWithNoTests: true,
    maxWorkers: 2,
    fileParallelism: true,
    projects: [p("../../packages/frontend/vitest.e2e.config.ts")],
  },
});
