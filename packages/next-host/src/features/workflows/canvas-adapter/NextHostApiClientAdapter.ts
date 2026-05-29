import type { RunWorkflowRequest, RunWorkflowResult, WorkflowCanvasApiClient } from "@codemation/canvas";
import type { BinaryAttachment } from "@codemation/core/browser";
import type {
  AppsResponse,
  AssertionMetricTrendDto,
  CredentialInstanceDto,
  CredentialInstanceWithSecretsDto,
  InviteUserResponseDto,
  StartTestSuiteRunRequest,
  StartTestSuiteRunResponse,
  TestAssertionDto,
  TestSuiteChildRunDto,
  TestSuiteRunDetailDto,
  TestSuiteRunSummaryDto,
  UserAccountDto,
  UserAccountStatus,
  WorkflowCredentialHealthDto,
  WorkflowDto,
  WorkflowSummary,
} from "@codemation/host/dto";
import type { CredentialTypeDefinition } from "@codemation/core/browser";
import type {
  Items,
  PersistedRunState,
  PersistedWorkflowSnapshot,
  RunSummary,
  TelemetryRunTraceViewDto,
  WorkflowDebuggerOverlayState,
  WorkflowRunDetailDto,
} from "@codemation/canvas";
import { ApiPaths } from "@codemation/host/client";
import { codemationApiClient } from "../../../api/CodemationApiClient";
import {
  fetchWorkflow,
  fetchWorkflows,
  fetchWorkflowRuns,
  fetchWorkflowDebuggerOverlay,
  fetchRun,
  fetchRunDetail,
  fetchTelemetryRunTrace,
  fetchCredentialTypes,
  fetchCredentialFieldEnvStatus,
  fetchCredentialApps,
  fetchCredentialInstances,
  fetchCredentialInstanceWithSecrets,
  fetchWorkflowCredentialHealth,
  fetchUserAccounts,
  fetchWorkflowTestSuiteRuns,
  fetchTestSuiteRunDetail,
  fetchTestSuiteRunAssertions,
  fetchRunAssertions,
  fetchTestSuiteRunChildRuns,
  postStartTestSuiteRun,
  fetchAssertionMetricTrends,
  patchWorkflowActivation,
} from "../lib/realtime/realtimeApi";

export class NextHostApiClientAdapter implements WorkflowCanvasApiClient {
  async fetchWorkflows(): Promise<ReadonlyArray<WorkflowSummary>> {
    return fetchWorkflows();
  }

  async fetchWorkflow(workflowId: string): Promise<WorkflowDto> {
    return fetchWorkflow(workflowId);
  }

  async fetchWorkflowRuns(workflowId: string): Promise<ReadonlyArray<RunSummary>> {
    return fetchWorkflowRuns(workflowId);
  }

  async fetchWorkflowDebuggerOverlay(workflowId: string): Promise<WorkflowDebuggerOverlayState> {
    return fetchWorkflowDebuggerOverlay(workflowId);
  }

  async fetchRun(runId: string, options?: Readonly<{ signal?: AbortSignal }>): Promise<PersistedRunState> {
    return fetchRun(runId, options);
  }

  async fetchRunDetail(runId: string, options?: Readonly<{ signal?: AbortSignal }>): Promise<WorkflowRunDetailDto> {
    return fetchRunDetail(runId, options);
  }

  async fetchTelemetryRunTrace(
    runId: string,
    options?: Readonly<{ signal?: AbortSignal }>,
  ): Promise<TelemetryRunTraceViewDto> {
    return fetchTelemetryRunTrace(runId, options);
  }

  async fetchCredentialTypes(): Promise<ReadonlyArray<CredentialTypeDefinition>> {
    return fetchCredentialTypes();
  }

  async fetchCredentialFieldEnvStatus(): Promise<Readonly<Record<string, boolean>>> {
    return fetchCredentialFieldEnvStatus();
  }

  async fetchCredentialApps(): Promise<AppsResponse> {
    return fetchCredentialApps();
  }

  async fetchCredentialInstances(): Promise<ReadonlyArray<CredentialInstanceDto>> {
    return fetchCredentialInstances();
  }

  async fetchCredentialInstanceWithSecrets(instanceId: string): Promise<CredentialInstanceWithSecretsDto> {
    return fetchCredentialInstanceWithSecrets(instanceId);
  }

  async fetchWorkflowCredentialHealth(workflowId: string): Promise<WorkflowCredentialHealthDto> {
    return fetchWorkflowCredentialHealth(workflowId);
  }

  async fetchUserAccounts(): Promise<ReadonlyArray<UserAccountDto>> {
    return fetchUserAccounts();
  }

  async fetchWorkflowTestSuiteRuns(workflowId: string): Promise<ReadonlyArray<TestSuiteRunSummaryDto>> {
    return fetchWorkflowTestSuiteRuns(workflowId);
  }

  async fetchTestSuiteRunDetail(testSuiteRunId: string): Promise<TestSuiteRunDetailDto> {
    return fetchTestSuiteRunDetail(testSuiteRunId);
  }

  async fetchTestSuiteRunAssertions(testSuiteRunId: string): Promise<ReadonlyArray<TestAssertionDto>> {
    return fetchTestSuiteRunAssertions(testSuiteRunId);
  }

  async fetchRunAssertions(runId: string): Promise<ReadonlyArray<TestAssertionDto>> {
    return fetchRunAssertions(runId);
  }

  async fetchTestSuiteRunChildRuns(testSuiteRunId: string): Promise<ReadonlyArray<TestSuiteChildRunDto>> {
    return fetchTestSuiteRunChildRuns(testSuiteRunId);
  }

  async postStartTestSuiteRun(workflowId: string, body: StartTestSuiteRunRequest): Promise<StartTestSuiteRunResponse> {
    return postStartTestSuiteRun(workflowId, body);
  }

  async fetchAssertionMetricTrends(
    workflowId: string,
    names?: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<AssertionMetricTrendDto>> {
    return fetchAssertionMetricTrends(workflowId, names);
  }

  async patchWorkflowActivation(workflowId: string, active: boolean): Promise<Readonly<{ active: boolean }>> {
    return patchWorkflowActivation(workflowId, active);
  }

  async postRunWorkflow(workflowId: string, request: RunWorkflowRequest): Promise<RunWorkflowResult> {
    return codemationApiClient.postJson<RunWorkflowResult>(ApiPaths.run(), {
      workflowId,
      ...request,
    });
  }

  async postRunNode(
    runId: string,
    nodeId: string,
    items: Items | undefined,
    mode?: import("@codemation/canvas").RunWorkflowMode,
    synthesizeTriggerItems?: boolean,
  ): Promise<RunWorkflowResult> {
    return codemationApiClient.postJson<RunWorkflowResult>(ApiPaths.runNode(runId, nodeId), {
      items,
      mode,
      synthesizeTriggerItems,
    });
  }

  async patchRunNodePin(runId: string, nodeId: string, items: Items | undefined): Promise<PersistedRunState> {
    return codemationApiClient.patchJson<PersistedRunState>(ApiPaths.runNodePin(runId, nodeId), { items });
  }

  async patchRunWorkflowSnapshot(
    runId: string,
    workflowSnapshot: PersistedWorkflowSnapshot,
  ): Promise<PersistedRunState> {
    return codemationApiClient.patchJson<PersistedRunState>(ApiPaths.runWorkflowSnapshot(runId), {
      workflowSnapshot,
    });
  }

  async putWorkflowDebuggerOverlay(
    workflowId: string,
    currentState: import("@codemation/canvas").RunCurrentState,
  ): Promise<WorkflowDebuggerOverlayState> {
    return codemationApiClient.putJson<WorkflowDebuggerOverlayState>(ApiPaths.workflowDebuggerOverlay(workflowId), {
      currentState,
    });
  }

  async postWorkflowDebuggerOverlayCopyRun(
    workflowId: string,
    sourceRunId: string,
  ): Promise<WorkflowDebuggerOverlayState> {
    return codemationApiClient.postJson<WorkflowDebuggerOverlayState>(
      ApiPaths.workflowDebuggerOverlayCopyRun(workflowId),
      { sourceRunId },
    );
  }

  async postUserInvite(email: string): Promise<InviteUserResponseDto> {
    return codemationApiClient.postJson<InviteUserResponseDto>(ApiPaths.userInvites(), { email });
  }

  async postUserInviteRegenerate(userId: string): Promise<InviteUserResponseDto> {
    return codemationApiClient.postJson<InviteUserResponseDto>(ApiPaths.userInviteRegenerate(userId));
  }

  async patchUserStatus(userId: string, status: UserAccountStatus): Promise<UserAccountDto> {
    return codemationApiClient.patchJson<UserAccountDto>(ApiPaths.userStatus(userId), { status });
  }

  async postWorkflowDebuggerOverlayBinaryUpload(
    workflowId: string,
    args: Readonly<{
      nodeId: string;
      itemIndex: number;
      attachmentName: string;
      file: File;
    }>,
  ): Promise<Readonly<{ attachment: BinaryAttachment }>> {
    const formData = new FormData();
    formData.append("nodeId", args.nodeId);
    formData.append("itemIndex", String(args.itemIndex));
    formData.append("attachmentName", args.attachmentName);
    formData.append("file", args.file);
    return codemationApiClient.postFormData<Readonly<{ attachment: BinaryAttachment }>>(
      ApiPaths.workflowDebuggerOverlayBinaryUpload(workflowId),
      formData,
    );
  }
}
