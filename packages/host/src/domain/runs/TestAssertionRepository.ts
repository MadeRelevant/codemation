import type { AssertionStatus, JsonValue } from "@codemation/core";

/**
 * Persistence-facing record for a TestAssertion. One row per assertion item emitted by an
 * `emitsAssertions: true` node during a run with `executionOptions.testContext` set.
 */
export interface TestAssertionRecord {
  readonly id: string;
  readonly runId: string;
  readonly testSuiteRunId: string;
  readonly workflowId: string;
  readonly nodeId: string;
  readonly iterationId?: string;
  readonly itemIndex?: number;
  readonly name: string;
  readonly status: AssertionStatus;
  readonly score?: number;
  readonly expected?: JsonValue;
  readonly actual?: JsonValue;
  readonly message?: string;
  readonly details?: Readonly<Record<string, JsonValue>>;
  readonly createdAt: string;
}

/** Args accepted by `record`. The persister fills these from a `nodeCompleted` event. */
export interface RecordTestAssertionArgs {
  readonly id: string;
  readonly runId: string;
  readonly testSuiteRunId: string;
  readonly workflowId: string;
  readonly nodeId: string;
  readonly iterationId?: string;
  readonly itemIndex?: number;
  readonly name: string;
  readonly status: AssertionStatus;
  readonly score?: number;
  readonly expected?: JsonValue;
  readonly actual?: JsonValue;
  readonly message?: string;
  readonly details?: Readonly<Record<string, JsonValue>>;
  readonly createdAt: string;
}

export interface TestAssertionRepository {
  record(args: RecordTestAssertionArgs): Promise<void>;
  listByRun(runId: string): Promise<ReadonlyArray<TestAssertionRecord>>;
  listByTestSuiteRun(testSuiteRunId: string): Promise<ReadonlyArray<TestAssertionRecord>>;
  deleteByTestSuiteRun(testSuiteRunId: string): Promise<void>;
}
