"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchAssertionMetricTrends,
  fetchRunAssertions,
  fetchTestSuiteRunAssertions,
  fetchTestSuiteRunChildRuns,
  fetchTestSuiteRunDetail,
  fetchWorkflowTestSuiteRuns,
  postStartTestSuiteRun,
  type StartTestSuiteRunRequest,
  type StartTestSuiteRunResponse,
} from "../../lib/realtime/realtimeApi";
import {
  assertionMetricTrendsQueryKey,
  runAssertionsQueryKey,
  testSuiteRunAssertionsQueryKey,
  testSuiteRunChildRunsQueryKey,
  testSuiteRunDetailQueryKey,
  workflowTestSuiteRunsQueryKey,
} from "../../lib/realtime/realtimeQueryKeys";

export function useWorkflowTestSuiteRunsQuery(workflowId: string) {
  return useQuery({
    queryKey: workflowTestSuiteRunsQueryKey(workflowId),
    queryFn: async () => await fetchWorkflowTestSuiteRuns(workflowId),
    enabled: Boolean(workflowId),
  });
}

export function useTestSuiteRunDetailQuery(testSuiteRunId: string | null) {
  return useQuery({
    queryKey: testSuiteRunDetailQueryKey(testSuiteRunId ?? ""),
    queryFn: async () => await fetchTestSuiteRunDetail(testSuiteRunId!),
    enabled: Boolean(testSuiteRunId),
  });
}

export function useTestSuiteRunAssertionsQuery(testSuiteRunId: string | null) {
  return useQuery({
    queryKey: testSuiteRunAssertionsQueryKey(testSuiteRunId ?? ""),
    queryFn: async () => await fetchTestSuiteRunAssertions(testSuiteRunId!),
    enabled: Boolean(testSuiteRunId),
  });
}

export function useRunAssertionsQuery(runId: string | null) {
  return useQuery({
    queryKey: runAssertionsQueryKey(runId ?? ""),
    queryFn: async () => await fetchRunAssertions(runId!),
    enabled: Boolean(runId),
  });
}

export function useTestSuiteRunChildRunsQuery(testSuiteRunId: string | null) {
  return useQuery({
    queryKey: testSuiteRunChildRunsQueryKey(testSuiteRunId ?? ""),
    queryFn: async () => await fetchTestSuiteRunChildRuns(testSuiteRunId!),
    enabled: Boolean(testSuiteRunId),
  });
}

/**
 * Trends data for the multi-metric chart in the Tests panel. Pass an empty `selectedNames`
 * array to populate the dropdown (returns one entry per distinct assertion name with empty
 * `perSuiteRun` arrays); pass a non-empty array to fetch actual data points for those metrics.
 */
export function useAssertionMetricTrendsQuery(workflowId: string, selectedNames: ReadonlyArray<string>) {
  return useQuery({
    queryKey: assertionMetricTrendsQueryKey(workflowId, selectedNames),
    queryFn: async () =>
      await fetchAssertionMetricTrends(workflowId, selectedNames.length > 0 ? selectedNames : undefined),
    enabled: Boolean(workflowId),
  });
}

export function useStartTestSuiteRunMutation(workflowId: string) {
  const queryClient = useQueryClient();
  return useMutation<StartTestSuiteRunResponse, Error, StartTestSuiteRunRequest>({
    mutationFn: async (body) => await postStartTestSuiteRun(workflowId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workflowTestSuiteRunsQueryKey(workflowId) });
      // Invalidate every cached metric-trends query for this workflow so the chart updates
      // once the new suite run finishes (and any new metric names appear in the dropdown).
      await queryClient.invalidateQueries({ queryKey: ["assertion-metric-trends", workflowId] });
    },
  });
}
