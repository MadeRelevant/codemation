import type { RunStatus, TestSuiteRunStatus } from "@codemation/core";

/**
 * Persistence-facing record for a TestSuiteRun. Mirrors the Prisma row shape closely so
 * adapters stay thin. JSON-serialized fields are decoded into typed shapes here.
 */
export interface TestSuiteRunRecord {
  readonly id: string;
  readonly workflowId: string;
  readonly triggerNodeId: string;
  /** Snapshotted at creation so the UI survives renames/deletions of the trigger node. */
  readonly triggerNodeName?: string;
  readonly status: TestSuiteRunStatus | "running";
  readonly concurrency: number;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly totalCases: number;
  readonly passedCases: number;
  readonly failedCases: number;
  /** Set of nodeIds executed across all child runs in this suite (deduped). */
  readonly nodeCoverage?: ReadonlyArray<string>;
  readonly errorMessage?: string;
  readonly updatedAt: string;
}

/** Args accepted by `create` — everything except `updatedAt` (set by adapter). */
export interface CreateTestSuiteRunArgs {
  readonly id: string;
  readonly workflowId: string;
  readonly triggerNodeId: string;
  readonly triggerNodeName?: string;
  readonly concurrency: number;
  readonly startedAt: string;
}

/** Patch accepted by `update`; any field omitted leaves the existing column unchanged. */
export interface UpdateTestSuiteRunPatch {
  readonly status?: TestSuiteRunStatus | "running";
  readonly finishedAt?: string;
  readonly totalCases?: number;
  readonly passedCases?: number;
  readonly failedCases?: number;
  readonly nodeCoverage?: ReadonlyArray<string>;
  readonly errorMessage?: string;
}

/**
 * Compact projection of a Run row for the Tests-tab tree-table — just enough to render the
 * case header (status icon, label, case index, link to the run inspector). The tree-table
 * fetches assertions separately (per-suite) and joins them client-side.
 *
 * `testCaseStatus` is the per-case result status (running/succeeded/failed/errored/cancelled),
 * reflecting workflow result + assertion outcomes. If null, defaults to the run's status.
 */
export interface TestSuiteChildRunSummary {
  readonly runId: string;
  readonly testSuiteRunId: string;
  readonly testCaseIndex: number;
  readonly testCaseLabel?: string;
  readonly status: RunStatus;
  readonly testCaseStatus?: string;
  readonly startedAt: string;
  readonly finishedAt?: string;
}

export interface TestSuiteRunRepository {
  create(args: CreateTestSuiteRunArgs): Promise<void>;
  update(id: string, patch: UpdateTestSuiteRunPatch): Promise<void>;
  findById(id: string): Promise<TestSuiteRunRecord | undefined>;
  listByWorkflow(args: Readonly<{ workflowId: string; limit?: number }>): Promise<ReadonlyArray<TestSuiteRunRecord>>;
  /** Lists child runs (one per dispatched test case) in `testCaseIndex` order. */
  listChildRuns(testSuiteRunId: string): Promise<ReadonlyArray<TestSuiteChildRunSummary>>;
  deleteById(id: string): Promise<void>;
}
