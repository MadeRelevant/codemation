"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
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

export function useStartTestSuiteRunMutation(workflowId: string) {
  const queryClient = useQueryClient();
  return useMutation<StartTestSuiteRunResponse, Error, StartTestSuiteRunRequest>({
    mutationFn: async (body) => await postStartTestSuiteRun(workflowId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workflowTestSuiteRunsQueryKey(workflowId) });
    },
  });
}
