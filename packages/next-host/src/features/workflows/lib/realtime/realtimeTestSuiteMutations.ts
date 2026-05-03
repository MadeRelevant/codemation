import type { QueryClient } from "@tanstack/react-query";

import {
  runAssertionsQueryKey,
  testSuiteRunAssertionsQueryKey,
  testSuiteRunChildRunsQueryKey,
  testSuiteRunDetailQueryKey,
  workflowTestSuiteRunsQueryKey,
} from "./realtimeQueryKeys";

/**
 * The shape we read off a realtime websocket message for test-suite events. Kept loose because
 * the browser-side `WorkflowEvent` discriminated union doesn't model the test-suite event kinds
 * yet (server adds them via `@codemation/core`'s `RunEvent`); typing them strictly would couple
 * this file to a deeper import graph than it needs.
 */
type TestSuiteRealtimeEvent =
  | Readonly<{ kind: "testSuiteStarted"; testSuiteRunId: string; workflowId: string }>
  | Readonly<{ kind: "testCaseStarted"; testSuiteRunId: string; runId: string; workflowId: string }>
  | Readonly<{ kind: "testCaseCompleted"; testSuiteRunId: string; runId: string; workflowId: string }>
  | Readonly<{ kind: "testSuiteFinished"; testSuiteRunId: string; workflowId: string }>;

const RUN_TO_SUITE_KEY = (runId: string) => ["run-test-suite-link", runId] as const;

/**
 * Tracks `runId → testSuiteRunId` linkages for the lifetime of the page so subsequent run-level
 * events (`nodeCompleted`, `runSaved`) can find the right suite to invalidate. Populated by
 * `testCaseStarted` (the first event per case that carries both ids).
 *
 * Stored in the React Query cache so the lookup survives re-renders without module-level state.
 */
function recordRunBelongsToSuite(queryClient: QueryClient, runId: string, testSuiteRunId: string): void {
  queryClient.setQueryData(RUN_TO_SUITE_KEY(runId), testSuiteRunId);
}

export function findSuiteIdForRun(queryClient: QueryClient, runId: string): string | undefined {
  return queryClient.getQueryData<string>(RUN_TO_SUITE_KEY(runId));
}

/** Returns true iff the event kind belongs to the test-suite family this module handles. */
export function isTestSuiteRealtimeEvent(event: { kind: string }): event is TestSuiteRealtimeEvent {
  return (
    event.kind === "testSuiteStarted" ||
    event.kind === "testCaseStarted" ||
    event.kind === "testCaseCompleted" ||
    event.kind === "testSuiteFinished"
  );
}

/**
 * React-Query invalidations for test-suite lifecycle realtime events. Symmetric with
 * `applyWorkflowEvent` (which handles per-run events). Together these keep the Tests tab
 * up-to-date as cases stream in, without polling.
 */
export function applyTestSuiteEvent(queryClient: QueryClient, event: TestSuiteRealtimeEvent): void {
  switch (event.kind) {
    case "testSuiteStarted":
      void queryClient.invalidateQueries({ queryKey: workflowTestSuiteRunsQueryKey(event.workflowId) });
      void queryClient.invalidateQueries({ queryKey: testSuiteRunDetailQueryKey(event.testSuiteRunId) });
      void queryClient.invalidateQueries({ queryKey: testSuiteRunChildRunsQueryKey(event.testSuiteRunId) });
      return;
    case "testCaseStarted":
      recordRunBelongsToSuite(queryClient, event.runId, event.testSuiteRunId);
      void queryClient.invalidateQueries({ queryKey: workflowTestSuiteRunsQueryKey(event.workflowId) });
      void queryClient.invalidateQueries({ queryKey: testSuiteRunDetailQueryKey(event.testSuiteRunId) });
      void queryClient.invalidateQueries({ queryKey: testSuiteRunChildRunsQueryKey(event.testSuiteRunId) });
      return;
    case "testCaseCompleted":
      recordRunBelongsToSuite(queryClient, event.runId, event.testSuiteRunId);
      void queryClient.invalidateQueries({ queryKey: workflowTestSuiteRunsQueryKey(event.workflowId) });
      void queryClient.invalidateQueries({ queryKey: testSuiteRunDetailQueryKey(event.testSuiteRunId) });
      void queryClient.invalidateQueries({ queryKey: testSuiteRunChildRunsQueryKey(event.testSuiteRunId) });
      void queryClient.invalidateQueries({ queryKey: testSuiteRunAssertionsQueryKey(event.testSuiteRunId) });
      void queryClient.invalidateQueries({ queryKey: runAssertionsQueryKey(event.runId) });
      return;
    case "testSuiteFinished":
      void queryClient.invalidateQueries({ queryKey: workflowTestSuiteRunsQueryKey(event.workflowId) });
      void queryClient.invalidateQueries({ queryKey: testSuiteRunDetailQueryKey(event.testSuiteRunId) });
      void queryClient.invalidateQueries({ queryKey: testSuiteRunChildRunsQueryKey(event.testSuiteRunId) });
      void queryClient.invalidateQueries({ queryKey: testSuiteRunAssertionsQueryKey(event.testSuiteRunId) });
      return;
  }
}

/**
 * Per-run realtime events (`nodeCompleted`, `runSaved`, etc.) — when the run is part of a
 * tracked test suite, invalidate the assertion queries so newly-persisted `TestAssertion`
 * rows show up on the Tests tab without a manual refresh.
 *
 * Looks up the suite id from the run→suite map populated by `testCaseStarted`. If we never
 * saw `testCaseStarted` for this run (e.g. opening the Tests tab mid-flight), this is a no-op
 * — the next `testCaseCompleted` will do a full invalidation anyway.
 */
export function applyRunEventForTestSuite(queryClient: QueryClient, event: { kind: string; runId?: string }): void {
  if (event.kind !== "nodeCompleted" && event.kind !== "nodeFailed" && event.kind !== "runSaved") {
    return;
  }
  if (!event.runId) return;
  const suiteId = findSuiteIdForRun(queryClient, event.runId);
  if (!suiteId) return;
  void queryClient.invalidateQueries({ queryKey: testSuiteRunAssertionsQueryKey(suiteId) });
  void queryClient.invalidateQueries({ queryKey: runAssertionsQueryKey(event.runId) });
  // runSaved means the run reached a terminal state — refetch the child-runs list so the case
  // status badge flips from running → completed/failed without waiting for testCaseCompleted.
  if (event.kind === "runSaved") {
    void queryClient.invalidateQueries({ queryKey: testSuiteRunDetailQueryKey(suiteId) });
    void queryClient.invalidateQueries({ queryKey: testSuiteRunChildRunsQueryKey(suiteId) });
  }
}
