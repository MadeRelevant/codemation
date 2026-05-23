import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    conditions: ["development"],
  },
  test: {
    name: "@codemation/cli",
    root: import.meta.dirname,
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: ["**/*.integration.test.ts"],
    pool: "threads",
    testTimeout: 120_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        // Auto-excluded: barrel / type-only files
        "src/**/index.ts",
        "src/**/*.types.ts",

        // Entry points — exercised by integration tests and `tsx`-driven e2e runs, not unit suite
        "src/bin.ts",
        "src/CliBin.ts",
        "src/CliProgramFactory.ts",

        // Bootstrap / session — exercised by integration tests (CodemationCliApplicationSession)
        "src/bootstrap/CodemationCliApplicationSession.ts",

        // Command action handlers — thin Commander wrappers exercised via integration tests
        "src/commands/BuildCommand.ts",
        "src/commands/CollectionsDeleteCommand.ts",
        "src/commands/CollectionsGetCommand.ts",
        "src/commands/CollectionsInsertCommand.ts",
        "src/commands/CollectionsListCommand.ts",
        "src/commands/CollectionsRowsCommand.ts",
        "src/commands/CollectionsShowCommand.ts",
        "src/commands/CollectionsSyncCommand.ts",
        "src/commands/CollectionsUpdateCommand.ts",
        "src/commands/DbMigrateCommand.ts",
        "src/commands/DevCommand.ts",
        "src/commands/DevPluginCommand.ts",
        "src/commands/ServeWebCommand.ts",
        "src/commands/ServeWorkerCommand.ts",
        "src/commands/SkillsSyncCommand.ts",
        "src/commands/UserCreateCommand.ts",
        "src/commands/UserListCommand.ts",

        // Dev-mode runtime — composition roots that orchestrate spawned child processes;
        // require a running host, Next.js child, and filesystem; integration-tested end-to-end
        "src/dev/Builder.ts",
        "src/dev/CliDevProxyServerFactory.ts",
        "src/dev/DevApiRuntimeFactory.ts",
        "src/dev/DevApiRuntimeHost.ts",
        "src/dev/DevApiRuntimeServer.ts",
        "src/dev/DevBootstrapSummaryFetcher.ts",
        "src/dev/DevHttpProbe.ts",
        "src/dev/DevLock.ts",
        "src/dev/DevRebuildQueueFactory.ts",
        "src/dev/DevSessionServices.ts",
        "src/dev/Factory.ts",
        "src/dev/PluginDevConfigFactory.ts",
        "src/dev/Runner.ts",
        "src/dev/WorkspacePluginDevProcessCoordinator.ts",

        // Database — spawns pnpm/prisma; exercised by integration tests
        "src/database/PrismaMigrateDeployInvoker.ts",

        // Collections bootstrap — requires a live DB session; integration-tested
        "src/collections/CollectionsCliBootstrap.ts",

        // Pure type declaration file (no executable statements); excluded by convention
        "src/dev/DevApiRuntimeTypes.ts",

        // User admin — requires a live DB session; integration-tested
        "src/user/LocalUserCreator.ts",
        "src/user/UserAdminCliBootstrap.ts",
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 80,
      },
    },
  },
});
