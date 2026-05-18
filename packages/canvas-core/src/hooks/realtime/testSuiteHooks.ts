"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  assertionMetricTrendsQueryKey,
  runAssertionsQueryKey,
  testSuiteRunAssertionsQueryKey,
  testSuiteRunChildRunsQueryKey,
  testSuiteRunDetailQueryKey,
  workflowTestSuiteRunsQueryKey,
} from "../../realtime/realtimeQueryKeys";
import { useWorkflowCanvasApiClient } from "../../context/WorkflowCanvasApiClientContext";
import type { StartTestSuiteRunRequest, StartTestSuiteRunResponse } from "@codemation/host/dto";

export function useWorkflowTestSuiteRunsQuery(workflowId: string) {
  const apiClient = useWorkflowCanvasApiClient();
  return useQuery({
    queryKey: workflowTestSuiteRunsQueryKey(workflowId),
    queryFn: async () => await apiClient.fetchWorkflowTestSuiteRuns(workflowId),
    enabled: Boolean(workflowId),
  });
}

export function useTestSuiteRunDetailQuery(testSuiteRunId: string | null) {
  const apiClient = useWorkflowCanvasApiClient();
  return useQuery({
    queryKey: testSuiteRunDetailQueryKey(testSuiteRunId ?? ""),
    queryFn: async () => await apiClient.fetchTestSuiteRunDetail(testSuiteRunId!),
    enabled: Boolean(testSuiteRunId),
  });
}

export function useTestSuiteRunAssertionsQuery(testSuiteRunId: string | null) {
  const apiClient = useWorkflowCanvasApiClient();
  return useQuery({
    queryKey: testSuiteRunAssertionsQueryKey(testSuiteRunId ?? ""),
    queryFn: async () => await apiClient.fetchTestSuiteRunAssertions(testSuiteRunId!),
    enabled: Boolean(testSuiteRunId),
  });
}

export function useRunAssertionsQuery(runId: string | null) {
  const apiClient = useWorkflowCanvasApiClient();
  return useQuery({
    queryKey: runAssertionsQueryKey(runId ?? ""),
    queryFn: async () => await apiClient.fetchRunAssertions(runId!),
    enabled: Boolean(runId),
  });
}

export function useTestSuiteRunChildRunsQuery(testSuiteRunId: string | null) {
  const apiClient = useWorkflowCanvasApiClient();
  return useQuery({
    queryKey: testSuiteRunChildRunsQueryKey(testSuiteRunId ?? ""),
    queryFn: async () => await apiClient.fetchTestSuiteRunChildRuns(testSuiteRunId!),
    enabled: Boolean(testSuiteRunId),
  });
}

/**
 * Trends data for the multi-metric chart in the Tests panel. Pass an empty `selectedNames`
 * array to populate the dropdown (returns one entry per distinct assertion name with empty
 * `perSuiteRun` arrays); pass a non-empty array to fetch actual data points for those metrics.
 */
export function useAssertionMetricTrendsQuery(workflowId: string, selectedNames: ReadonlyArray<string>) {
  const apiClient = useWorkflowCanvasApiClient();
  return useQuery({
    queryKey: assertionMetricTrendsQueryKey(workflowId, selectedNames),
    queryFn: async () =>
      await apiClient.fetchAssertionMetricTrends(workflowId, selectedNames.length > 0 ? selectedNames : undefined),
    enabled: Boolean(workflowId),
  });
}

export function useStartTestSuiteRunMutation(workflowId: string) {
  const apiClient = useWorkflowCanvasApiClient();
  const queryClient = useQueryClient();
  return useMutation<StartTestSuiteRunResponse, Error, StartTestSuiteRunRequest>({
    mutationFn: async (body) => await apiClient.postStartTestSuiteRun(workflowId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workflowTestSuiteRunsQueryKey(workflowId) });
      // Invalidate every cached metric-trends query for this workflow so the chart updates
      // once the new suite run finishes (and any new metric names appear in the dropdown).
      await queryClient.invalidateQueries({ queryKey: ["assertion-metric-trends", workflowId] });
    },
  });
}
