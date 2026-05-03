import type { JsonValue, RunStatus, TestSuiteRunStatus } from "@codemation/core";

/** Body of `POST /api/workflows/:workflowId/test-suite-runs`. */
export interface StartTestSuiteRunRequest {
  readonly triggerNodeId: string;
  readonly concurrency?: number;
}

/**
 * Response of `POST /api/workflows/:workflowId/test-suite-runs`. Returned **early** (before the
 * suite finishes) — the orchestrator runs in the background and the UI tracks progress via
 * realtime websocket events. So the response is just enough to navigate to the detail view.
 */
export interface StartTestSuiteRunResponse {
  readonly testSuiteRunId: string;
  readonly status: TestSuiteRunStatus | "running";
}

/**
 * One child run inside a TestSuiteRun, as returned by `GET /api/test-suite-runs/:id/runs`.
 * The Tests-tab tree-table renders one row per item even when no assertions have been emitted
 * yet — so users can see all queued / running / completed / failed cases as they progress.
 */
export interface TestSuiteChildRunDto {
  readonly runId: string;
  readonly testSuiteRunId: string;
  readonly testCaseIndex: number;
  readonly testCaseLabel?: string;
  readonly status: RunStatus;
  readonly startedAt: string;
  readonly finishedAt?: string;
}

/** Row shape returned by the suite list endpoint (compact: omits coverage/error details). */
export interface TestSuiteRunSummaryDto {
  readonly id: string;
  readonly workflowId: string;
  readonly triggerNodeId: string;
  readonly triggerNodeName?: string;
  readonly status: TestSuiteRunStatus | "running";
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly totalCases: number;
  readonly passedCases: number;
  readonly failedCases: number;
}

/** Full record returned by the suite-detail endpoint. */
export interface TestSuiteRunDetailDto extends TestSuiteRunSummaryDto {
  readonly concurrency: number;
  readonly nodeCoverage?: ReadonlyArray<string>;
  readonly errorMessage?: string;
  readonly updatedAt: string;
}

/**
 * One per-suite-run aggregation point inside an {@link AssertionMetricTrendDto}: the mean score
 * of all rows whose `name` matches, scoped to a specific suite run. `sampleCount` is the number
 * of underlying assertion rows that contributed (useful as a tooltip hint and for filtering out
 * single-sample noise).
 */
export interface AssertionMetricTrendPointDto {
  readonly testSuiteRunId: string;
  readonly startedAt: string;
  readonly meanScore: number;
  readonly sampleCount: number;
}

/**
 * Trend of one assertion-metric (`name`) across the workflow's recent test-suite runs. Returned
 * by `GET /api/workflows/:workflowId/assertion-metric-trends`. `perSuiteRun` is sorted oldest →
 * newest by `startedAt` so chart code can render it directly without re-sorting.
 *
 * When the endpoint is hit *without* a `?names=` filter, every distinct assertion name on the
 * workflow is returned; with a filter, only the requested subset (still listing all the names
 * even if some have zero data points yet, so the UI can render placeholder lines).
 */
export interface AssertionMetricTrendDto {
  readonly name: string;
  readonly perSuiteRun: ReadonlyArray<AssertionMetricTrendPointDto>;
}

/**
 * One row returned from the per-run assertions endpoint. The pass/fail decision is **derived**
 * from `score >= (passThreshold ?? 0.5)` (or hard-fail when `errored` is true) — UIs should call
 * `deriveAssertionPassed` from `@codemation/core/contracts` rather than store/recompute it here.
 */
export interface TestAssertionDto {
  readonly id: string;
  readonly runId: string;
  readonly testSuiteRunId: string;
  readonly workflowId: string;
  readonly nodeId: string;
  readonly iterationId?: string;
  readonly itemIndex?: number;
  readonly name: string;
  readonly score: number;
  readonly passThreshold?: number;
  readonly errored?: true;
  readonly expected?: JsonValue;
  readonly actual?: JsonValue;
  readonly message?: string;
  readonly details?: Readonly<Record<string, JsonValue>>;
  readonly createdAt: string;
}
