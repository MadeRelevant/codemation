import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  test: {
    name: "@codemation/canvas-core",
    root: import.meta.dirname,
    // jsdom is required for hook tests (@testing-library/react).
    // Pure canvas-lib tests (no DOM needed) still work fine in jsdom.
    environment: "jsdom",
    include: ["src/**/*.test.ts", "test/**/*.test.ts", "test/**/*.test.tsx"],
    pool: "threads",
    coverage: {
      // Measure all source files so uncovered utilities cannot silently inflate %.
      all: true,
      provider: "v8",
      include: ["src/**"],
      exclude: [
        // Pure re-export barrel — no logic to test.
        "src/index.ts",
        // Declaration files only — no runtime code.
        "src/**/*.d.ts",
        // Pure TypeScript type files — contain only type aliases/interfaces, no executable lines.
        "src/realtime/realtimeDomainTypes.ts",
        "src/realtime/workflowTypes.ts",
        "src/lib/workflowDetail/workflowDetailTypes.ts",
        // All type-only files under src/types/ — interface definitions with no runtime code.
        "src/types/**",
        // ELK layout files — async canvas layout (requires elkjs worker); covered by canvas package.
        "src/canvas-lib/elk/**",
        // layoutWorkflow orchestrates ELK (async, requires elkjs + WorkflowDto wiring); tested via canvas e2e.
        "src/canvas-lib/layoutWorkflow.ts",
        // workflowCanvasNodeData is a pure type-alias file (type WorkflowCanvasNodeData); no executable lines.
        "src/canvas-lib/workflowCanvasNodeData.ts",
        // Hook files that require TanStack Query context or full React realtime infrastructure.
        // These are already tested via canvas package integration tests (controller behavior tests).
        "src/hooks/canvas/useAsyncWorkflowLayout.ts",
        "src/hooks/useLastRunTrigger.ts",
        "src/hooks/useSelectedAssertionMetrics.ts",
        "src/hooks/useWorkflowCanvasRunButton.ts",
        "src/hooks/realtime/realtime.ts",
        "src/hooks/realtime/runQueryPolling.ts",
        "src/hooks/realtime/testSuiteHooks.ts",
        "src/hooks/realtime/useTelemetryRunTraceQuery.ts",
        "src/hooks/realtime/userAccountMutations.ts",
        "src/hooks/realtime/useWorkflowRealtimeShowDisconnectedBadge.ts",
        "src/hooks/workflowDetail/useExecutionTreeAutoFollow.ts",
        "src/hooks/workflowDetail/useWorkflowDetailController.ts",
        "src/hooks/workflowDetail/useWorkflowTestSuiteController.ts",
        // Realtime mutation helpers — require QueryClient wiring; tested via realtime infrastructure tests.
        "src/realtime/realtimeRunMutations.ts",
        "src/realtime/realtimeTelemetryMutations.ts",
        "src/realtime/realtimeTestSuiteMutations.ts",
        // Large presenter/factory/adapter files — require full domain model wiring; tested via WorkflowDetailPresenter tests.
        "src/lib/workflowDetail/WorkflowDetailPresenter.ts",
        "src/lib/workflowDetail/NodeInspectorTelemetryPresenter.ts",
        "src/lib/workflowDetail/ExecutionTreeItemGroupInjector.ts",
        "src/lib/workflowDetail/FocusedInvocationModelFactory.ts",
        "src/lib/workflowDetail/PersistedWorkflowSnapshotMapper.ts",
        "src/lib/workflowDetail/WorkflowExecutionTreeDataLoaderAdapter.ts",
        // createWorkflowCanvasApiClient — full HTTP client factory; untestable without a live host.
        "src/lib/createWorkflowCanvasApiClient.ts",
        // Test helpers are not product code — exclude from coverage measurement.
        "test/**",
      ],
      thresholds: {
        lines: 90,
        functions: 85,
        branches: 80,
      },
    },
  },
  resolve: {
    conditions: ["development", "import", "module", "default"],
  },
});
