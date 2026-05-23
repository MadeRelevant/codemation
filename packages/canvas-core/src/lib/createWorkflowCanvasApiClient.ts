import type {
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
import type { BinaryAttachment, CredentialTypeDefinition } from "@codemation/core/browser";
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
import type {
  WorkflowCanvasApiClient,
  RunWorkflowMode,
  RunWorkflowResult,
  RunWorkflowRequest,
} from "../types/WorkflowCanvasApiClient";
import { CodemationApiHttpError } from "./CodemationApiHttpError";

/**
 * Options for createWorkflowCanvasApiClient.
 *
 * @param apiBase   Base URL for the workspace API (e.g. "https://ws-1.example.com").
 *                  Use "" for same-origin (self-hosted / next-host).
 * @param getToken  Returns a bearer token string, or null for cookie-based auth.
 *                  On 401, called again with { forceRefresh: true } for a one-shot retry.
 * @param fetch     Optional fetch implementation (defaults to globalThis.fetch).
 */
export type WorkflowCanvasApiClientOptions = Readonly<{
  apiBase: string;
  getToken: (opts?: Readonly<{ forceRefresh?: boolean }>) => Promise<string | null> | string | null;
  fetch?: typeof globalThis.fetch;
}>;

function buildHeaders(token: string | null, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (token !== null) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Creates a WorkflowCanvasApiClient that talks directly to a workspace's HTTP API.
 *
 * - When getToken returns null, no Authorization header is sent and existing
 *   cookie/credential behaviour is preserved (self-hosted mode).
 * - On HTTP 401, the client calls getToken({ forceRefresh: true }) once and retries.
 *   If the retry also fails with 401, the error is surfaced normally.
 */
export function createWorkflowCanvasApiClient(options: WorkflowCanvasApiClientOptions): WorkflowCanvasApiClient {
  const { apiBase, getToken, fetch: fetchImpl = globalThis.fetch } = options;

  function url(path: string): string {
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    return apiBase ? `${apiBase.replace(/\/$/, "")}/${cleanPath}` : `/${cleanPath}`;
  }

  async function requestOrThrow(
    input: string,
    init: RequestInit,
    token: string | null,
    retryOn401 = true,
  ): Promise<Response> {
    const headers = buildHeaders(token, init.headers as Record<string, string> | undefined);
    const credentials: RequestCredentials = token === null ? "same-origin" : "omit";
    const response = await fetchImpl(input, {
      cache: "no-store",
      ...init,
      credentials,
      headers,
    });
    if (response.status === 401 && retryOn401) {
      const refreshed = await getToken({ forceRefresh: true });
      return requestOrThrow(input, init, refreshed, false);
    }
    if (!response.ok) {
      const bodyText = typeof response.text === "function" ? await response.text() : "";
      throw new CodemationApiHttpError(response.status, bodyText);
    }
    return response;
  }

  async function parseJson<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch {
      const text = typeof response.text === "function" ? await response.text() : "";
      if (!text.trim()) return undefined as T;
      return JSON.parse(text) as T;
    }
  }

  async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
    const token = await getToken();
    const response = await requestOrThrow(url(path), { method: "GET", signal }, token);
    return parseJson<T>(response);
  }

  async function postJson<T>(path: string, body?: unknown): Promise<T> {
    const token = await getToken();
    const response = await requestOrThrow(
      url(path),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      token,
    );
    return parseJson<T>(response);
  }

  async function patchJson<T>(path: string, body?: unknown): Promise<T> {
    const token = await getToken();
    const response = await requestOrThrow(
      url(path),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      token,
    );
    return parseJson<T>(response);
  }

  async function putJson<T>(path: string, body?: unknown): Promise<T> {
    const token = await getToken();
    const response = await requestOrThrow(
      url(path),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      token,
    );
    return parseJson<T>(response);
  }

  return {
    async fetchWorkflows(): Promise<ReadonlyArray<WorkflowSummary>> {
      return getJson("api/workflows");
    },

    async fetchWorkflow(workflowId: string): Promise<WorkflowDto> {
      return getJson(`api/workflows/${encodeURIComponent(workflowId)}`);
    },

    async fetchWorkflowRuns(workflowId: string): Promise<ReadonlyArray<RunSummary>> {
      return getJson(`api/workflows/${encodeURIComponent(workflowId)}/runs`);
    },

    async fetchWorkflowDebuggerOverlay(workflowId: string): Promise<WorkflowDebuggerOverlayState> {
      return getJson(`api/workflows/${encodeURIComponent(workflowId)}/debugger-overlay`);
    },

    async fetchRun(runId: string, options?: Readonly<{ signal?: AbortSignal }>): Promise<PersistedRunState> {
      return getJson(`api/runs/${encodeURIComponent(runId)}`, options?.signal);
    },

    async fetchRunDetail(runId: string, options?: Readonly<{ signal?: AbortSignal }>): Promise<WorkflowRunDetailDto> {
      return getJson(`api/runs/${encodeURIComponent(runId)}/detail`, options?.signal);
    },

    async fetchTelemetryRunTrace(
      runId: string,
      options?: Readonly<{ signal?: AbortSignal }>,
    ): Promise<TelemetryRunTraceViewDto> {
      return getJson(`api/telemetry/runs/${encodeURIComponent(runId)}/trace`, options?.signal);
    },

    async fetchCredentialTypes(): Promise<ReadonlyArray<CredentialTypeDefinition>> {
      return getJson("api/credentials/types");
    },

    async fetchCredentialFieldEnvStatus(): Promise<Readonly<Record<string, boolean>>> {
      return getJson("api/credentials/env-status");
    },

    async fetchCredentialInstances(): Promise<ReadonlyArray<CredentialInstanceDto>> {
      return getJson("api/credentials/instances");
    },

    async fetchCredentialInstanceWithSecrets(instanceId: string): Promise<CredentialInstanceWithSecretsDto> {
      return getJson(`api/credentials/instances/${encodeURIComponent(instanceId)}?withSecrets=1`);
    },

    async fetchWorkflowCredentialHealth(workflowId: string): Promise<WorkflowCredentialHealthDto> {
      return getJson(`api/workflows/${encodeURIComponent(workflowId)}/credential-health`);
    },

    async fetchUserAccounts(): Promise<ReadonlyArray<UserAccountDto>> {
      return getJson("api/users");
    },

    async fetchWorkflowTestSuiteRuns(workflowId: string): Promise<ReadonlyArray<TestSuiteRunSummaryDto>> {
      return getJson(`api/workflows/${encodeURIComponent(workflowId)}/test-suite-runs`);
    },

    async fetchTestSuiteRunDetail(testSuiteRunId: string): Promise<TestSuiteRunDetailDto> {
      return getJson(`api/test-suite-runs/${encodeURIComponent(testSuiteRunId)}`);
    },

    async fetchTestSuiteRunAssertions(testSuiteRunId: string): Promise<ReadonlyArray<TestAssertionDto>> {
      return getJson(`api/test-suite-runs/${encodeURIComponent(testSuiteRunId)}/assertions`);
    },

    async fetchRunAssertions(runId: string): Promise<ReadonlyArray<TestAssertionDto>> {
      return getJson(`api/runs/${encodeURIComponent(runId)}/assertions`);
    },

    async fetchTestSuiteRunChildRuns(testSuiteRunId: string): Promise<ReadonlyArray<TestSuiteChildRunDto>> {
      return getJson(`api/test-suite-runs/${encodeURIComponent(testSuiteRunId)}/runs`);
    },

    async postStartTestSuiteRun(
      workflowId: string,
      body: StartTestSuiteRunRequest,
    ): Promise<StartTestSuiteRunResponse> {
      return postJson(`api/workflows/${encodeURIComponent(workflowId)}/test-suite-runs`, body);
    },

    async fetchAssertionMetricTrends(
      workflowId: string,
      names?: ReadonlyArray<string>,
    ): Promise<ReadonlyArray<AssertionMetricTrendDto>> {
      const base = `api/workflows/${encodeURIComponent(workflowId)}/assertion-metric-trends`;
      const path =
        names && names.length > 0 ? `${base}?names=${names.map((n) => encodeURIComponent(n)).join(",")}` : base;
      return getJson(path);
    },

    async patchWorkflowActivation(workflowId: string, active: boolean): Promise<Readonly<{ active: boolean }>> {
      return patchJson(`api/workflows/${encodeURIComponent(workflowId)}/activation`, { active });
    },

    async postRunWorkflow(workflowId: string, request: RunWorkflowRequest): Promise<RunWorkflowResult> {
      return postJson("api/runs", { workflowId, ...request });
    },

    async postRunNode(
      runId: string,
      nodeId: string,
      items: Items | undefined,
      mode?: RunWorkflowMode,
      synthesizeTriggerItems?: boolean,
    ): Promise<RunWorkflowResult> {
      return postJson(`api/runs/${encodeURIComponent(runId)}/nodes/${encodeURIComponent(nodeId)}/run`, {
        items,
        mode,
        synthesizeTriggerItems,
      });
    },

    async patchRunNodePin(runId: string, nodeId: string, items: Items | undefined): Promise<PersistedRunState> {
      return patchJson(`api/runs/${encodeURIComponent(runId)}/nodes/${encodeURIComponent(nodeId)}/pin`, { items });
    },

    async patchRunWorkflowSnapshot(
      runId: string,
      workflowSnapshot: PersistedWorkflowSnapshot,
    ): Promise<PersistedRunState> {
      return patchJson(`api/runs/${encodeURIComponent(runId)}/workflow-snapshot`, { workflowSnapshot });
    },

    async putWorkflowDebuggerOverlay(
      workflowId: string,
      currentState: RunCurrentState,
    ): Promise<WorkflowDebuggerOverlayState> {
      return putJson(`api/workflows/${encodeURIComponent(workflowId)}/debugger-overlay`, { currentState });
    },

    async postWorkflowDebuggerOverlayCopyRun(
      workflowId: string,
      sourceRunId: string,
    ): Promise<WorkflowDebuggerOverlayState> {
      return postJson(`api/workflows/${encodeURIComponent(workflowId)}/debugger-overlay/copy-run`, { sourceRunId });
    },

    async postUserInvite(email: string): Promise<InviteUserResponseDto> {
      return postJson("api/users/invites", { email });
    },

    async postUserInviteRegenerate(userId: string): Promise<InviteUserResponseDto> {
      return postJson(`api/users/${encodeURIComponent(userId)}/invites/regenerate`);
    },

    async patchUserStatus(userId: string, status: UserAccountStatus): Promise<UserAccountDto> {
      return patchJson(`api/users/${encodeURIComponent(userId)}/status`, { status });
    },

    async postWorkflowDebuggerOverlayBinaryUpload(
      workflowId: string,
      args: Readonly<{ nodeId: string; itemIndex: number; attachmentName: string; file: File }>,
    ): Promise<Readonly<{ attachment: BinaryAttachment }>> {
      const formData = new FormData();
      formData.append("nodeId", args.nodeId);
      formData.append("itemIndex", String(args.itemIndex));
      formData.append("attachmentName", args.attachmentName);
      formData.append("file", args.file);
      const token = await getToken();
      const headers = buildHeaders(token);
      const credentials: RequestCredentials = token === null ? "same-origin" : "omit";
      const response = await fetchImpl(
        url(`api/workflows/${encodeURIComponent(workflowId)}/debugger-overlay/binary/upload`),
        { method: "POST", body: formData, headers, credentials, cache: "no-store" },
      );
      if (!response.ok) {
        const bodyText = typeof response.text === "function" ? await response.text() : "";
        throw new CodemationApiHttpError(response.status, bodyText);
      }
      return parseJson(response);
    },
  };
}
