import type { BinaryAttachment, CredentialTypeDefinition } from "@codemation/core/browser";
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
import type {
  Items,
  PersistedRunState,
  PersistedWorkflowSnapshot,
  RunCurrentState,
  RunSummary,
  TelemetryRunTraceViewDto,
  WorkflowDebuggerOverlayState,
  WorkflowRunDetailDto,
} from "../realtime/realtimeDomainTypes";

export type RunWorkflowMode = "manual" | "debug";

export type RunWorkflowResult = Readonly<{
  runId: string;
  workflowId: string;
  status: string;
  startedAt?: string;
  state: PersistedRunState | null;
}>;

export type RunWorkflowRequest = Readonly<{
  items?: Items;
  currentState?: RunCurrentState;
  startAt?: string;
  stopAt?: string;
  clearFromNodeId?: string;
  mode?: RunWorkflowMode;
  sourceRunId?: string;
  synthesizeTriggerItems?: boolean;
}>;

export type WorkflowCanvasApiClient = Readonly<{
  fetchWorkflows(): Promise<ReadonlyArray<WorkflowSummary>>;
  fetchWorkflow(workflowId: string): Promise<WorkflowDto>;
  fetchWorkflowRuns(workflowId: string): Promise<ReadonlyArray<RunSummary>>;
  fetchWorkflowDebuggerOverlay(workflowId: string): Promise<WorkflowDebuggerOverlayState>;
  fetchRun(runId: string, options?: Readonly<{ signal?: AbortSignal }>): Promise<PersistedRunState>;
  fetchRunDetail(runId: string, options?: Readonly<{ signal?: AbortSignal }>): Promise<WorkflowRunDetailDto>;
  fetchTelemetryRunTrace(
    runId: string,
    options?: Readonly<{ signal?: AbortSignal }>,
  ): Promise<TelemetryRunTraceViewDto>;
  fetchCredentialTypes(): Promise<ReadonlyArray<CredentialTypeDefinition>>;
  fetchCredentialFieldEnvStatus(): Promise<Readonly<Record<string, boolean>>>;
  fetchCredentialInstances(): Promise<ReadonlyArray<CredentialInstanceDto>>;
  fetchCredentialApps(): Promise<AppsResponse>;
  fetchCredentialInstanceWithSecrets(instanceId: string): Promise<CredentialInstanceWithSecretsDto>;
  fetchWorkflowCredentialHealth(workflowId: string): Promise<WorkflowCredentialHealthDto>;
  fetchUserAccounts(): Promise<ReadonlyArray<UserAccountDto>>;
  fetchWorkflowTestSuiteRuns(workflowId: string): Promise<ReadonlyArray<TestSuiteRunSummaryDto>>;
  fetchTestSuiteRunDetail(testSuiteRunId: string): Promise<TestSuiteRunDetailDto>;
  fetchTestSuiteRunAssertions(testSuiteRunId: string): Promise<ReadonlyArray<TestAssertionDto>>;
  fetchRunAssertions(runId: string): Promise<ReadonlyArray<TestAssertionDto>>;
  fetchTestSuiteRunChildRuns(testSuiteRunId: string): Promise<ReadonlyArray<TestSuiteChildRunDto>>;
  postStartTestSuiteRun(workflowId: string, body: StartTestSuiteRunRequest): Promise<StartTestSuiteRunResponse>;
  fetchAssertionMetricTrends(
    workflowId: string,
    names?: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<AssertionMetricTrendDto>>;
  patchWorkflowActivation(workflowId: string, active: boolean): Promise<Readonly<{ active: boolean }>>;
  postRunWorkflow(workflowId: string, request: RunWorkflowRequest): Promise<RunWorkflowResult>;
  postRunNode(
    runId: string,
    nodeId: string,
    items: Items | undefined,
    mode?: RunWorkflowMode,
    synthesizeTriggerItems?: boolean,
  ): Promise<RunWorkflowResult>;
  patchRunNodePin(runId: string, nodeId: string, items: Items | undefined): Promise<PersistedRunState>;
  patchRunWorkflowSnapshot(runId: string, workflowSnapshot: PersistedWorkflowSnapshot): Promise<PersistedRunState>;
  putWorkflowDebuggerOverlay(workflowId: string, currentState: RunCurrentState): Promise<WorkflowDebuggerOverlayState>;
  postWorkflowDebuggerOverlayCopyRun(workflowId: string, sourceRunId: string): Promise<WorkflowDebuggerOverlayState>;
  postUserInvite(email: string): Promise<InviteUserResponseDto>;
  postUserInviteRegenerate(userId: string): Promise<InviteUserResponseDto>;
  patchUserStatus(userId: string, status: UserAccountStatus): Promise<UserAccountDto>;
  postWorkflowDebuggerOverlayBinaryUpload(
    workflowId: string,
    args: Readonly<{
      nodeId: string;
      itemIndex: number;
      attachmentName: string;
      file: File;
    }>,
  ): Promise<Readonly<{ attachment: BinaryAttachment }>>;
}>;
