import type { CredentialTypeDefinition } from "@codemation/core/browser";
import type {
  CredentialInstanceDto,
  CredentialInstanceWithSecretsDto,
  WorkflowCredentialHealthDto,
} from "@codemation/host-src/application/contracts/CredentialContractsRegistry";
import {
  withUserAccountLoginMethodsDefaults,
  type UserAccountDto,
} from "@codemation/host-src/application/contracts/userDirectoryContracts.types";
import type { WorkflowDto, WorkflowSummary } from "@codemation/host-src/application/contracts/WorkflowViewContracts";
import { ApiPaths } from "@codemation/host-src/presentation/http/ApiPaths";

import { codemationApiClient } from "../../../../api/CodemationApiClient";

import type { PersistedRunState, RunSummary, WorkflowDebuggerOverlayState } from "./realtimeDomainTypes";

export async function fetchWorkflows(): Promise<ReadonlyArray<WorkflowSummary>> {
  return await codemationApiClient.getJson<ReadonlyArray<WorkflowSummary>>(ApiPaths.workflows());
}

export async function fetchWorkflow(workflowId: string): Promise<WorkflowDto> {
  return await codemationApiClient.getJson<WorkflowDto>(ApiPaths.workflow(workflowId));
}

export async function fetchWorkflowRuns(workflowId: string): Promise<ReadonlyArray<RunSummary>> {
  return await codemationApiClient.getJson<ReadonlyArray<RunSummary>>(ApiPaths.workflowRuns(workflowId));
}

export async function fetchWorkflowDebuggerOverlay(workflowId: string): Promise<WorkflowDebuggerOverlayState> {
  return await codemationApiClient.getJson<WorkflowDebuggerOverlayState>(ApiPaths.workflowDebuggerOverlay(workflowId));
}

export async function fetchRun(runId: string): Promise<PersistedRunState> {
  return await codemationApiClient.getJson<PersistedRunState>(ApiPaths.runState(runId));
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
