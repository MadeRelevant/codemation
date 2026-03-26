import { defineConfig } from "vitest/config";
import { hostVitestSharedConfig } from "./vitest.shared";

export default defineConfig({
  ...hostVitestSharedConfig,
  test: {
    name: "@codemation/host-integration",
    root: import.meta.dirname,
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
    globalSetup: ["./scripts/ensure-prisma-runtime-sourcemaps.mjs", "./scripts/integration-database-global-setup.mjs"],
    setupFiles: ["./test/integration/loadSharedIntegrationDatabaseEnv.ts", "./test/setup.ts"],
    include: ["./test/**/*.integration.test.ts", "./test/**/*.integration.test.tsx"],
    passWithNoTests: true,
    pool: "threads",
    // Each file gets a clean module graph so parallel workers/files cannot leak tsyringe/globals between suites.
    isolate: true,
    maxWorkers: 2,
    // Shared migrated DB + Prisma rollback: run files sequentially to avoid cross-file races.
    fileParallelism: false,
    hookTimeout: 180_000,
    testTimeout: 180_000,
  },
});
