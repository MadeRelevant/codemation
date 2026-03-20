import { defineConfig } from "vitest/config";
import { frontendVitestSharedConfig } from "./vitest.shared";

export default defineConfig({
  ...frontendVitestSharedConfig,
  test: {
    name: "@codemation/frontend-e2e",
    root: import.meta.dirname,
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
    include: ["./test/**/*.e2e.test.ts", "./test/**/*.e2e.test.tsx"],
    // Reserved for Playwright/Cypress-style suites; keep green until first e2e file lands.
    passWithNoTests: true,
    pool: "threads",
    isolate: true,
    maxWorkers: 2,
    fileParallelism: true,
  },
});
