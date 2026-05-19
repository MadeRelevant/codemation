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
        // Remaining SQLite collection helpers — require live SQLite DB
        "src/infrastructure/collections/SqliteCollectionAdvisoryLockService.ts",
        "src/infrastructure/collections/SqliteCollectionAdvisoryLockServiceFactory.ts",
        "src/infrastructure/collections/SqliteCollectionDdlEmitter.ts",
        "src/infrastructure/collections/SqliteCollectionDdlEmitterFactory.ts",
        "src/infrastructure/collections/SqliteCollectionSchemaIntrospectorFactory.ts",
        "src/infrastructure/collections/SqliteCollectionStoreFactory.ts",
        // Broker pairing — requires live paired control-plane connection
        "src/credentials/BrokerClient.ts",
        "src/credentials/BrokerRefreshError.ts",
        "src/credentials/BrokerRefreshInvalidGrantError.ts",
        "src/credentials/OAuth2ViaBrokerCredentialTypeFactory.ts",
        "src/pairing/**",
        // Bootstrap runtime entry points — composed at startup
        "src/bootstrap/CodemationContainerRegistrationRegistrar.ts",
        "src/bootstrap/CodemationBootstrapRequest.ts",
        "src/bootstrap/CodemationRuntimeUrlResolver.ts",
        "src/bootstrap/runtime/**",
        // Prisma adapters requiring live DB beyond what integration already covers
        "src/infrastructure/persistence/CodemationPostgres*.ts",
        // Postgres audit log — requires live Prisma Postgres client
        "src/audit/PrismaWorkflowAuditLogRepository.ts",
        // Application command — requires live DB bootstrap user upsert
        "src/application/commands/UpsertLocalBootstrapUserCommand.ts",
        // Bootstrap composition root — wires all DI registrations at startup; no unit-testable surface
        "src/bootstrap/AppContainerFactory.ts",
        // Consumer config loader — requires the tsx module import machinery; covered by e2e
        "src/presentation/server/CodemationConsumerConfigLoader.ts",
        // Plugin discovery — wraps module filesystem scanning; covered by e2e
        "src/presentation/server/CodemationPluginDiscovery.ts",
      ],
    },
  },
});
