"use client";
import { useMemo, useState } from "react";
import {
  useAssertionMetricTrendsQuery,
  useStartTestSuiteRunMutation,
  useTestSuiteRunAssertionsQuery,
  useTestSuiteRunChildRunsQuery,
  useTestSuiteRunDetailQuery,
  useWorkflowTestSuiteRunsQuery,
} from "../realtime/testSuiteHooks";
import { useSelectedAssertionMetrics } from "../useSelectedAssertionMetrics";
import type { WorkflowTestSuiteControllerReturn } from "../../types/workflowDetail/WorkflowTestSuiteControllerReturn.types";

// Stable empty arrays so downstream memoisation is not perturbed on loading states.
const EMPTY_SUITE_RUNS: WorkflowTestSuiteControllerReturn["suiteRuns"] = [];
const EMPTY_ASSERTIONS: WorkflowTestSuiteControllerReturn["assertions"] = [];
const EMPTY_CHILD_RUNS: WorkflowTestSuiteControllerReturn["childRuns"] = [];
const EMPTY_METRIC_TRENDS: WorkflowTestSuiteControllerReturn["allMetricTrends"] = [];

/**
 * Standalone sub-controller for test-suite state.
 *
 * This controller is NOT composed into the `useWorkflowDetailController` façade
 * (the mega-hook never exposed test-suite state). It is a new public controller
 * that customer-ui (Story H) can use directly to build its own Tests view.
 */
export function useWorkflowTestSuiteController(
  args: Readonly<{ workflowId: string }>,
): WorkflowTestSuiteControllerReturn {
  const { workflowId } = args;

  const suitesQuery = useWorkflowTestSuiteRunsQuery(workflowId);
  const startMutation = useStartTestSuiteRunMutation(workflowId);

  const [selectedSuiteRunId, setSelectedSuiteRunId] = useState<string | null>(null);
  const detailQuery = useTestSuiteRunDetailQuery(selectedSuiteRunId);
  const assertionsQuery = useTestSuiteRunAssertionsQuery(selectedSuiteRunId);
  const childRunsQuery = useTestSuiteRunChildRunsQuery(selectedSuiteRunId);

  const [selectedMetrics, setSelectedMetrics] = useSelectedAssertionMetrics(workflowId);
  const selectedMetricsArray = useMemo(() => [...selectedMetrics].sort(), [selectedMetrics]);

  const allMetricsQuery = useAssertionMetricTrendsQuery(workflowId, []);
  const selectedMetricsQuery = useAssertionMetricTrendsQuery(workflowId, selectedMetricsArray);

  return {
    suiteRuns: suitesQuery.data ?? EMPTY_SUITE_RUNS,
    suiteRunsLoading: suitesQuery.isLoading,
    selectedSuiteRunId,
    selectSuiteRun: setSelectedSuiteRunId,
    selectedSuiteRunDetail: detailQuery.data,
    selectedSuiteRunDetailLoading: detailQuery.isLoading,
    assertions: assertionsQuery.data ?? EMPTY_ASSERTIONS,
    assertionsLoading: assertionsQuery.isLoading,
    childRuns: childRunsQuery.data ?? EMPTY_CHILD_RUNS,
    childRunsLoading: childRunsQuery.isLoading,
    startTestSuiteRun: (triggerNodeId: string) => startMutation.mutateAsync({ triggerNodeId }),
    isStartPending: startMutation.isPending,
    startError: startMutation.isError ? (startMutation.error?.message ?? "Failed to start tests") : null,
    allMetricTrends: allMetricsQuery.data ?? EMPTY_METRIC_TRENDS,
    allMetricTrendsLoading: allMetricsQuery.isLoading,
    selectedMetrics,
    setSelectedMetrics,
    selectedMetricTrends: selectedMetricsQuery.data ?? EMPTY_METRIC_TRENDS,
    selectedMetricTrendsLoading: selectedMetricsQuery.isLoading,
  };
}
