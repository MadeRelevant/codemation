import { defineConfig } from "vitest/config";
import { frontendVitestSharedConfig } from "./vitest.shared";

export default defineConfig({
  ...frontendVitestSharedConfig,
  test: {
    name: "@codemation/frontend-integration",
    root: import.meta.dirname,
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
    globalSetup: ["./scripts/ensure-prisma-runtime-sourcemaps.mjs"],
    setupFiles: ["./test/setup.ts"],
    include: ["./test/**/*.integration.test.ts", "./test/**/*.integration.test.tsx"],
    passWithNoTests: true,
    pool: "threads",
    // Each file gets a clean module graph so parallel workers/files cannot leak tsyringe/globals between suites.
    isolate: true,
    maxWorkers: 2,
    fileParallelism: true,
    hookTimeout: 180_000,
    testTimeout: 180_000,
  },
});
