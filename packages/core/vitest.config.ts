import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "@codemation/core",
    root: import.meta.dirname,
    environment: "node",
    include: ["test/**/*.test.ts"],
    pool: "threads",
    testTimeout: 120_000,
    coverage: {
      all: true,
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        // barrel re-exports — no executable statements
        "**/index.ts",
        "src/browser.ts",
        "src/contracts.ts",
        "src/testing.ts",
        // pure type files
        "**/*.types.ts",
        "**/types/index.ts",
        // DI token stubs — contain only an empty class body, no executable logic
        "src/workflowSnapshots/MissingRuntimeNodeToken.ts",
        "src/workflowSnapshots/MissingRuntimeTriggerToken.ts",
        "src/workflowSnapshots/PersistedWorkflowTokenRegistryFactory.ts", // barrel re-export
        "src/ai/CallableToolKindToken.ts", // DI token — empty class body only
        // type-only module (TypeScript conditional types, no runtime)
        "src/workflow/dsl/workflowBuilderTypes.ts",
        // thin 1-line factory (ExecutableGraph constructor wrap — no branch logic)
        "src/workflow/graph/DefaultWorkflowGraphFactory.ts",
        // interface + NoOp stub; all methods are empty — no logic to exercise
        "src/triggers/polling/PollingTriggerLogger.ts",
        // NoOp telemetry / contract stubs — pure static values, no conditional logic
        "src/contracts/NoOpAgentMcpIntegration.ts",
        "src/contracts/NoOpCostTrackingTelemetry.ts",
        "src/contracts/NoOpCostTrackingTelemetryFactory.ts",
        "src/contracts/NoOpExecutionTelemetry.ts",
        "src/contracts/NoOpExecutionTelemetryFactory.ts",
        "src/contracts/NoOpNodeExecutionTelemetry.ts",
        "src/contracts/NoOpTelemetryArtifactReference.ts",
        "src/contracts/NoOpTelemetrySpanScope.ts",
        // Abstract interface-only contracts (no executable statements — only type/interface/export type)
        "src/contracts/CostCatalogContract.ts",
        "src/contracts/CostTrackingTelemetryContract.ts",
        "src/contracts/executionPersistenceContracts.ts",
        "src/contracts/telemetryTypes.ts",
        "src/contracts/testTriggerTypes.ts",
        "src/contracts/agentMcpTypes.ts",
        "src/contracts/baseTypes.ts",
        "src/contracts/mcpTypes.ts",
        "src/contracts/params.ts",
        "src/contracts/runTypes.ts",
        "src/contracts/runtimeTypes.ts",
        "src/contracts/webhookTypes.ts",
        "src/contracts/workflowTypes.ts",
        "src/contracts/collectionTypes.ts",
        "src/contracts/credentialTypes.ts",
        "src/contracts/assertionTypes.ts",
        "src/contracts/itemExpr.ts",
        "src/contracts/itemMeta.ts",
        // pure-type event bus definitions
        "src/events/runEvents.ts",
        // excluded from measurement per existing convention
        "src/execution/NodeRunStateWriter.ts",
        "src/execution/NodeRunStateWriterFactory.ts",
        // test harness code — not product code
        "test/**",
        "src/testing/**",
      ],
      /** Package-wide gate: ≥90% lines/statements/functions, ≥75% branches. */
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 75,
      },
    },
  },
});
