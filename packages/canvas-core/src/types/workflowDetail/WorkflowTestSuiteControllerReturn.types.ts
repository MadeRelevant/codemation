import type {
  AssertionMetricTrendDto,
  TestAssertionDto,
  TestSuiteChildRunDto,
  TestSuiteRunDetailDto,
  TestSuiteRunSummaryDto,
} from "@codemation/host/dto";

/**
 * Return interface for the test-suite sub-controller.
 *
 * Owns: test-cases, assertions, pass-rate chart data, delta tracking, and run CTA.
 * This controller is a NEW composition over existing test-suite hooks — it is NOT
 * extracted from useWorkflowDetailController (which has no test-suite state).
 * It is not composed into the façade; customer-ui uses it directly (Story H).
 */
export type WorkflowTestSuiteControllerReturn = Readonly<{
  /** Available test suite runs for this workflow, most-recent first. */
  suiteRuns: ReadonlyArray<TestSuiteRunSummaryDto>;
  suiteRunsLoading: boolean;
  /** The currently selected test suite run id. */
  selectedSuiteRunId: string | null;
  /** Select a suite run to view. */
  selectSuiteRun: (id: string | null) => void;
  /** Detail for the selected suite run. */
  selectedSuiteRunDetail: TestSuiteRunDetailDto | undefined;
  selectedSuiteRunDetailLoading: boolean;
  /** Assertion results for the selected suite run. */
  assertions: ReadonlyArray<TestAssertionDto>;
  assertionsLoading: boolean;
  /** Child workflow runs for the selected suite run. */
  childRuns: ReadonlyArray<TestSuiteChildRunDto>;
  childRunsLoading: boolean;
  /** Start a test suite run for the given trigger node. */
  startTestSuiteRun: (triggerNodeId: string) => Promise<{ testSuiteRunId: string }>;
  isStartPending: boolean;
  startError: string | null;
  /** Assertion metric trends for the pass-rate chart (all available metrics). */
  allMetricTrends: ReadonlyArray<AssertionMetricTrendDto>;
  allMetricTrendsLoading: boolean;
  /** Selected metrics for the secondary chart overlay. */
  selectedMetrics: ReadonlySet<string>;
  setSelectedMetrics: (metrics: ReadonlySet<string>) => void;
  /** Metric trends filtered to selectedMetrics (chart overlay data). */
  selectedMetricTrends: ReadonlyArray<AssertionMetricTrendDto>;
  selectedMetricTrendsLoading: boolean;
}>;
