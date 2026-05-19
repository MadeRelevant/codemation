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
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/index.ts",
        "src/**/*.types.ts",
        // Runtime DI reflection — cannot be unit-tested without tsyringe's metadata runtime
        "src/presentation/server/CodemationTsyringeParamInfoReader.ts",
        "src/presentation/server/CodemationTsyringeTypeInfoRegistrar.ts",
        // BullMQ wrappers — require a live Redis connection; covered by e2e only
        "src/infrastructure/scheduler/bullmq/BullmqScheduler.ts",
        "src/infrastructure/scheduler/bullmq/BullmqWorker.ts",
        "src/infrastructure/scheduler/bullmq/BullmqNodeExecutionScheduler.ts",
        // SQLite introspector — requires a live SQLite DB; covered by SQLite integration suite
        "src/infrastructure/collections/SqliteCollectionSchemaIntrospector.ts",
        // SQLite collection store — requires a live SQLite DB; covered by SQLite integration suite
        "src/infrastructure/collections/SqliteCollectionStore.ts",
        // S3 binary storage — requires a live AWS/S3-compatible endpoint
        "src/infrastructure/binary/S3BinaryStorage.ts",
        // Filesystem config loader — requires module import machinery (tsx); covered by e2e
        "src/presentation/server/WorkflowModulePathFinder.ts",
        // Internal HMAC route registrar — runtime DI + HMAC wiring; covered by integration
        "src/workflows/InternalWorkflowTestRunRegistrar.ts",
        "src/workflows/InternalWorkflowActivationRegistrar.ts",
      ],
    },
  },
});
