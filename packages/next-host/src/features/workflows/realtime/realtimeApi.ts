import type { CredentialTypeDefinition } from "@codemation/core/browser";
import type {
CredentialInstanceDto,
CredentialInstanceWithSecretsDto,
WorkflowCredentialHealthDto,
} from "@codemation/host-src/application/contracts/CredentialContractsRegistry";
import { withUserAccountLoginMethodsDefaults, type UserAccountDto } from "@codemation/host-src/application/contracts/userDirectoryContracts.types";
import type { WorkflowDto,WorkflowSummary } from "@codemation/host-src/application/contracts/WorkflowViewContracts";
import { ApiPaths } from "@codemation/host-src/presentation/http/ApiPaths";

import type {
PersistedRunState,
RunSummary,
WorkflowDebuggerOverlayState,
} from "./realtimeDomainTypes";

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as T;
}

export async function fetchWorkflows(): Promise<ReadonlyArray<WorkflowSummary>> {
  return await fetchJson<ReadonlyArray<WorkflowSummary>>(ApiPaths.workflows());
}

export async function fetchWorkflow(workflowId: string): Promise<WorkflowDto> {
  return await fetchJson<WorkflowDto>(ApiPaths.workflow(workflowId));
}

export async function fetchWorkflowRuns(workflowId: string): Promise<ReadonlyArray<RunSummary>> {
  return await fetchJson<ReadonlyArray<RunSummary>>(ApiPaths.workflowRuns(workflowId));
}

export async function fetchWorkflowDebuggerOverlay(workflowId: string): Promise<WorkflowDebuggerOverlayState> {
  return await fetchJson<WorkflowDebuggerOverlayState>(ApiPaths.workflowDebuggerOverlay(workflowId));
}

export async function fetchRun(runId: string): Promise<PersistedRunState> {
  return await fetchJson<PersistedRunState>(ApiPaths.runState(runId));
}

export async function fetchCredentialTypes(): Promise<ReadonlyArray<CredentialTypeDefinition>> {
  return await fetchJson<ReadonlyArray<CredentialTypeDefinition>>(ApiPaths.credentialTypes());
}

export async function fetchCredentialInstances(): Promise<ReadonlyArray<CredentialInstanceDto>> {
  return await fetchJson<ReadonlyArray<CredentialInstanceDto>>(ApiPaths.credentialInstances());
}

export async function fetchCredentialInstanceWithSecrets(instanceId: string): Promise<CredentialInstanceWithSecretsDto> {
  return await fetchJson<CredentialInstanceWithSecretsDto>(ApiPaths.credentialInstance(instanceId, true));
}

export async function fetchWorkflowCredentialHealth(workflowId: string): Promise<WorkflowCredentialHealthDto> {
  return await fetchJson<WorkflowCredentialHealthDto>(ApiPaths.workflowCredentialHealth(workflowId));
}

export async function fetchUserAccounts(): Promise<ReadonlyArray<UserAccountDto>> {
  const rows = await fetchJson<ReadonlyArray<UserAccountDto>>(ApiPaths.users());
  return rows.map((u) => withUserAccountLoginMethodsDefaults(u));
}
