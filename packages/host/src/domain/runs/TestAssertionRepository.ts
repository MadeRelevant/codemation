import type { JsonValue } from "@codemation/core";

/**
 * Persistence-facing record for a TestAssertion. One row per assertion item emitted by an
 * `emitsAssertions: true` node during a run with `executionOptions.testContext` set.
 *
 * Pass/fail is **derived** at read-time from `score >= (passThreshold ?? 0.5)` (with `errored`
 * always counting as fail). The persisted shape stores the inputs to that derivation, not its
 * result, so the threshold can be tuned (or re-applied to historical rows) without re-running.
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
  readonly score: number;
  readonly passThreshold?: number;
  readonly errored?: true;
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
  readonly score: number;
  readonly passThreshold?: number;
  readonly errored?: true;
  readonly expected?: JsonValue;
  readonly actual?: JsonValue;
  readonly message?: string;
  readonly details?: Readonly<Record<string, JsonValue>>;
  readonly createdAt: string;
}

/**
 * Aggregation row produced by {@link TestAssertionRepository.aggregateMeanScoreByNameAndSuiteRun}:
 * one row per `(testSuiteRunId, name)` pair, carrying the **mean** of `score` across the matching
 * assertion records and the count of contributing rows. Used by the trends endpoint to plot mean
 * score over time per assertion metric.
 */
export interface TestAssertionMeanScoreAggregation {
  readonly testSuiteRunId: string;
  readonly name: string;
  readonly meanScore: number;
  readonly sampleCount: number;
}

export interface TestAssertionRepository {
  record(args: RecordTestAssertionArgs): Promise<void>;
  listByRun(runId: string): Promise<ReadonlyArray<TestAssertionRecord>>;
  listByTestSuiteRun(testSuiteRunId: string): Promise<ReadonlyArray<TestAssertionRecord>>;
  deleteByTestSuiteRun(testSuiteRunId: string): Promise<void>;
  /**
   * Returns the distinct assertion names recorded for `workflowId` (ordered by name asc).
   * Drives the metric-multi-select dropdown in the Tests panel without paying the price of
   * fetching every assertion row.
   */
  listDistinctNamesByWorkflow(workflowId: string): Promise<ReadonlyArray<string>>;
  /**
   * Mean-score aggregation grouped by `(testSuiteRunId, name)` for one workflow, optionally
   * narrowed to a subset of assertion `names`. Suite-run start-time is **not** joined here —
   * callers that need it should pair this with the suite-run repository.
   */
  aggregateMeanScoreByNameAndSuiteRun(args: {
    readonly workflowId: string;
    readonly names?: ReadonlyArray<string>;
  }): Promise<ReadonlyArray<TestAssertionMeanScoreAggregation>>;
}
