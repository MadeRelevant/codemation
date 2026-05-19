import { defineConfig } from "vitest/config";
import { hostVitestSharedConfig } from "./vitest.shared";

export default defineConfig({
  ...hostVitestSharedConfig,
  test: {
    name: "@codemation/host-unit",
    root: import.meta.dirname,
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
    include: ["./test/**/*.test.ts"],
    exclude: ["./test/**/*.integration.test.ts", "./test/http/**", "./test/**/*.e2e.test.ts"],
    passWithNoTests: true,
    pool: "threads",
    isolate: true,
    maxWorkers: 2,
    fileParallelism: true,
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
        // Prisma adapters requiring live DB
        "src/infrastructure/persistence/Prisma*.ts",
        "src/infrastructure/persistence/CodemationPostgres*.ts",
        // Postgres audit log — requires live Prisma Postgres client
        "src/audit/PrismaWorkflowAuditLogRepository.ts",
        // Application command — requires live DB bootstrap user upsert
        "src/application/commands/UpsertLocalBootstrapUserCommand.ts",
      ],
      thresholds: {
        lines: 45,
        functions: 45,
        branches: 35,
      },
    },
  },
});
