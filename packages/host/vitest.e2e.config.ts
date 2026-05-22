import { defineConfig } from "vitest/config";
import { hostVitestSharedConfig } from "./vitest.shared";

export default defineConfig({
  ...hostVitestSharedConfig,
  test: {
    name: "@codemation/host-e2e",
    root: import.meta.dirname,
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
    include: ["./test/**/*.e2e.test.ts", "./test/**/*.e2e.test.tsx"],
    // Reserved for Playwright/Cypress-style suites; keep green until first e2e file lands.
    passWithNoTests: true,
    pool: "threads",
    isolate: true,
    maxWorkers: 1,
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/index.ts",
        "src/**/*.types.ts",
        // Generated Prisma clients — auto-generated, not hand-authored
        "../prisma-generated/**",
        // Test helpers — not production code
        "test/**",
        // Runtime DI reflection — cannot be unit-tested without tsyringe's metadata runtime
        "src/presentation/server/CodemationTsyringeParamInfoReader.ts",
        "src/presentation/server/CodemationTsyringeTypeInfoRegistrar.ts",
        // BullMQ wrappers — require a live Redis connection
        "src/infrastructure/scheduler/bullmq/BullmqScheduler.ts",
        "src/infrastructure/scheduler/bullmq/BullmqWorker.ts",
        "src/infrastructure/scheduler/bullmq/BullmqNodeExecutionScheduler.ts",
        // SQLite collection store — requires a live SQLite DB
        "src/infrastructure/collections/SqliteCollectionStore.ts",
        "src/infrastructure/collections/SqliteCollectionStoreFactory.ts",
        "src/infrastructure/collections/SqliteCollectionAdvisoryLockService.ts",
        "src/infrastructure/collections/SqliteCollectionAdvisoryLockServiceFactory.ts",
        "src/infrastructure/collections/SqliteCollectionDdlEmitter.ts",
        "src/infrastructure/collections/SqliteCollectionDdlEmitterFactory.ts",
        "src/infrastructure/collections/SqliteCollectionSchemaIntrospector.ts",
        "src/infrastructure/collections/SqliteCollectionSchemaIntrospectorFactory.ts",
        // Broker pairing — requires a live paired control-plane connection
        "src/credentials/BrokerClient.ts",
        "src/credentials/BrokerRefreshError.ts",
        "src/credentials/BrokerRefreshInvalidGrantError.ts",
        "src/credentials/OAuth2ViaBrokerCredentialTypeFactory.ts",
        "src/pairing/**",
        // Bootstrap runtime entry points — composed at startup, not unit-testable
        "src/bootstrap/CodemationContainerRegistrationRegistrar.ts",
        "src/bootstrap/CodemationBootstrapRequest.ts",
        "src/bootstrap/CodemationRuntimeUrlResolver.ts",
        "src/bootstrap/runtime/**",
        // Prisma persistence adapters — require live DB; measured by integration suite
        "src/infrastructure/persistence/Prisma*.ts",
        "src/infrastructure/persistence/CodemationPostgres*.ts",
        // S3 binary storage — requires a live AWS/S3-compatible endpoint
        "src/infrastructure/binary/S3BinaryStorage.ts",
        // Filesystem config loader — requires tsx module import machinery
        "src/presentation/server/WorkflowModulePathFinder.ts",
        // Internal workflow registrars — runtime DI wiring, covered by integration
        "src/workflows/InternalWorkflowTestRunRegistrar.ts",
        "src/workflows/InternalWorkflowActivationRegistrar.ts",
        // Postgres audit log — requires live Prisma Postgres client
        "src/audit/PrismaWorkflowAuditLogRepository.ts",
        // Application command — requires live DB bootstrap user upsert
        "src/application/commands/UpsertLocalBootstrapUserCommand.ts",
      ],
    },
  },
});
