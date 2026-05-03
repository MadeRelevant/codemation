import type { CredentialTypeDefinition } from "@codemation/core/browser";
import type {
  CredentialInstanceDto,
  CredentialInstanceWithSecretsDto,
  WorkflowCredentialHealthDto,
} from "@codemation/host/dto";
import { withUserAccountLoginMethodsDefaults, type UserAccountDto } from "@codemation/host/dto";
import type { WorkflowDto, WorkflowSummary } from "@codemation/host/dto";
import { ApiPaths } from "@codemation/host/client";

import { codemationApiClient } from "../../../../api/CodemationApiClient";

import type {
  PersistedRunState,
  RunSummary,
  TelemetryRunTraceViewDto,
  WorkflowDebuggerOverlayState,
  WorkflowRunDetailDto,
} from "./realtimeDomainTypes";

export async function fetchWorkflows(): Promise<ReadonlyArray<WorkflowSummary>> {
  return await codemationApiClient.getJson<ReadonlyArray<WorkflowSummary>>(ApiPaths.workflows());
}

export async function fetchWorkflow(workflowId: string): Promise<WorkflowDto> {
  return await codemationApiClient.getJson<WorkflowDto>(ApiPaths.workflow(workflowId));
}

export async function patchWorkflowActivation(
  workflowId: string,
  active: boolean,
): Promise<Readonly<{ active: boolean }>> {
  return await codemationApiClient.patchJson<Readonly<{ active: boolean }>>(ApiPaths.workflowActivation(workflowId), {
    active,
  });
}

export async function fetchWorkflowRuns(workflowId: string): Promise<ReadonlyArray<RunSummary>> {
  return await codemationApiClient.getJson<ReadonlyArray<RunSummary>>(ApiPaths.workflowRuns(workflowId));
}

export async function fetchWorkflowDebuggerOverlay(workflowId: string): Promise<WorkflowDebuggerOverlayState> {
  return await codemationApiClient.getJson<WorkflowDebuggerOverlayState>(ApiPaths.workflowDebuggerOverlay(workflowId));
}

export async function fetchRun(
  runId: string,
  options?: Readonly<{ signal?: AbortSignal }>,
): Promise<PersistedRunState> {
  const init: RequestInit | undefined = options?.signal ? { signal: options.signal } : undefined;
  return await codemationApiClient.getJson<PersistedRunState>(ApiPaths.runState(runId), init);
}

export async function fetchRunDetail(
  runId: string,
  options?: Readonly<{ signal?: AbortSignal }>,
): Promise<WorkflowRunDetailDto> {
  const init: RequestInit | undefined = options?.signal ? { signal: options.signal } : undefined;
  return await codemationApiClient.getJson<WorkflowRunDetailDto>(ApiPaths.runDetail(runId), init);
}

export async function fetchTelemetryRunTrace(
  runId: string,
  options?: Readonly<{ signal?: AbortSignal }>,
): Promise<TelemetryRunTraceViewDto> {
  const init: RequestInit | undefined = options?.signal ? { signal: options.signal } : undefined;
  return await codemationApiClient.getJson<TelemetryRunTraceViewDto>(ApiPaths.telemetryRunTrace(runId), init);
}

export async function fetchCredentialTypes(): Promise<ReadonlyArray<CredentialTypeDefinition>> {
  return await codemationApiClient.getJson<ReadonlyArray<CredentialTypeDefinition>>(ApiPaths.credentialTypes());
}

export async function fetchCredentialFieldEnvStatus(): Promise<Readonly<Record<string, boolean>>> {
  return await codemationApiClient.getJson<Readonly<Record<string, boolean>>>(ApiPaths.credentialsEnvStatus());
}

export async function fetchCredentialInstances(): Promise<ReadonlyArray<CredentialInstanceDto>> {
  return await codemationApiClient.getJson<ReadonlyArray<CredentialInstanceDto>>(ApiPaths.credentialInstances());
}

export async function fetchCredentialInstanceWithSecrets(
  instanceId: string,
): Promise<CredentialInstanceWithSecretsDto> {
  return await codemationApiClient.getJson<CredentialInstanceWithSecretsDto>(
    ApiPaths.credentialInstance(instanceId, true),
  );
}

export async function fetchWorkflowCredentialHealth(workflowId: string): Promise<WorkflowCredentialHealthDto> {
  return await codemationApiClient.getJson<WorkflowCredentialHealthDto>(ApiPaths.workflowCredentialHealth(workflowId));
}

export async function fetchUserAccounts(): Promise<ReadonlyArray<UserAccountDto>> {
  const rows = await codemationApiClient.getJson<ReadonlyArray<UserAccountDto>>(ApiPaths.users());
  return rows.map((u) => withUserAccountLoginMethodsDefaults(u));
}

import type {
  StartTestSuiteRunRequest,
  StartTestSuiteRunResponse,
  TestAssertionDto,
  TestSuiteChildRunDto,
  TestSuiteRunDetailDto,
  TestSuiteRunSummaryDto,
} from "@codemation/host/dto";

export type {
  StartTestSuiteRunRequest,
  StartTestSuiteRunResponse,
  TestAssertionDto,
  TestSuiteChildRunDto,
  TestSuiteRunDetailDto,
  TestSuiteRunSummaryDto,
};

export async function fetchWorkflowTestSuiteRuns(workflowId: string): Promise<ReadonlyArray<TestSuiteRunSummaryDto>> {
  return await codemationApiClient.getJson<ReadonlyArray<TestSuiteRunSummaryDto>>(
    ApiPaths.workflowTestSuiteRuns(workflowId),
  );
}

export async function fetchTestSuiteRunDetail(testSuiteRunId: string): Promise<TestSuiteRunDetailDto> {
  return await codemationApiClient.getJson<TestSuiteRunDetailDto>(ApiPaths.testSuiteRun(testSuiteRunId));
}

export async function fetchTestSuiteRunAssertions(testSuiteRunId: string): Promise<ReadonlyArray<TestAssertionDto>> {
  return await codemationApiClient.getJson<ReadonlyArray<TestAssertionDto>>(
    ApiPaths.testSuiteRunAssertions(testSuiteRunId),
  );
}

export async function fetchRunAssertions(runId: string): Promise<ReadonlyArray<TestAssertionDto>> {
  return await codemationApiClient.getJson<ReadonlyArray<TestAssertionDto>>(ApiPaths.runAssertions(runId));
}

export async function fetchTestSuiteRunChildRuns(testSuiteRunId: string): Promise<ReadonlyArray<TestSuiteChildRunDto>> {
  return await codemationApiClient.getJson<ReadonlyArray<TestSuiteChildRunDto>>(
    ApiPaths.testSuiteRunChildRuns(testSuiteRunId),
  );
}

export async function postStartTestSuiteRun(
  workflowId: string,
  body: StartTestSuiteRunRequest,
): Promise<StartTestSuiteRunResponse> {
  return await codemationApiClient.postJson<StartTestSuiteRunResponse>(
    ApiPaths.workflowTestSuiteRuns(workflowId),
    body,
  );
}
