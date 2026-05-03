import type { TestSuiteRunId } from "../contracts/testTriggerTypes";
import type { ConnectionInvocationRecord } from "../contracts/runTypes";
import type { NodeExecutionSnapshot, ParentExecutionRef, PersistedRunState, RunId, WorkflowId } from "../types";

/**
 * Outcome of a single test case (one workflow run dispatched by the test-suite orchestrator).
 * Matches `RunResult.status` for terminal cases.
 */
export type TestCaseRunStatus = "completed" | "failed";
/** Aggregate outcome of a TestSuiteRun. */
export type TestSuiteRunStatus = "succeeded" | "failed" | "partial" | "errored" | "cancelled";

export type RunEvent =
  | Readonly<{ kind: "runCreated"; runId: RunId; workflowId: WorkflowId; parent?: ParentExecutionRef; at: string }>
  | Readonly<{
      kind: "runSaved";
      runId: RunId;
      workflowId: WorkflowId;
      parent?: ParentExecutionRef;
      at: string;
      state: PersistedRunState;
    }>
  | Readonly<{
      kind: "nodeQueued";
      runId: RunId;
      workflowId: WorkflowId;
      parent?: ParentExecutionRef;
      at: string;
      snapshot: NodeExecutionSnapshot;
    }>
  | Readonly<{
      kind: "nodeStarted";
      runId: RunId;
      workflowId: WorkflowId;
      parent?: ParentExecutionRef;
      at: string;
      snapshot: NodeExecutionSnapshot;
    }>
  | Readonly<{
      kind: "nodeCompleted";
      runId: RunId;
      workflowId: WorkflowId;
      parent?: ParentExecutionRef;
      at: string;
      snapshot: NodeExecutionSnapshot;
    }>
  | Readonly<{
      kind: "nodeFailed";
      runId: RunId;
      workflowId: WorkflowId;
      parent?: ParentExecutionRef;
      at: string;
      snapshot: NodeExecutionSnapshot;
    }>
  | Readonly<{
      kind: "connectionInvocationStarted";
      runId: RunId;
      workflowId: WorkflowId;
      parent?: ParentExecutionRef;
      at: string;
      record: ConnectionInvocationRecord;
    }>
  | Readonly<{
      kind: "connectionInvocationCompleted";
      runId: RunId;
      workflowId: WorkflowId;
      parent?: ParentExecutionRef;
      at: string;
      record: ConnectionInvocationRecord;
    }>
  | Readonly<{
      kind: "connectionInvocationFailed";
      runId: RunId;
      workflowId: WorkflowId;
      parent?: ParentExecutionRef;
      at: string;
      record: ConnectionInvocationRecord;
    }>
  | Readonly<{
      kind: "testSuiteStarted";
      testSuiteRunId: TestSuiteRunId;
      workflowId: WorkflowId;
      triggerNodeId: string;
      triggerNodeName?: string;
      concurrency: number;
      at: string;
    }>
  | Readonly<{
      kind: "testSuiteFinished";
      testSuiteRunId: TestSuiteRunId;
      workflowId: WorkflowId;
      status: TestSuiteRunStatus;
      totalCases: number;
      passedCases: number;
      failedCases: number;
      at: string;
    }>
  | Readonly<{
      kind: "testCaseStarted";
      testSuiteRunId: TestSuiteRunId;
      testCaseIndex: number;
      runId: RunId;
      workflowId: WorkflowId;
      testCaseLabel?: string;
      at: string;
    }>
  | Readonly<{
      kind: "testCaseCompleted";
      testSuiteRunId: TestSuiteRunId;
      testCaseIndex: number;
      runId: RunId;
      workflowId: WorkflowId;
      status: TestCaseRunStatus;
      at: string;
    }>;

export interface RunEventSubscription {
  close(): Promise<void>;
}

export interface RunEventBus {
  publish(event: RunEvent): Promise<void>;
  subscribe(onEvent: (event: RunEvent) => void): Promise<RunEventSubscription>;
  subscribeToWorkflow(workflowId: WorkflowId, onEvent: (event: RunEvent) => void): Promise<RunEventSubscription>;
}
