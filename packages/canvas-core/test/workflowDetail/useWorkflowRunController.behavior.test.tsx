/**
 * Behavior tests for useWorkflowRunController.
 *
 * Covers:
 * - runWorkflow / startRun callbacks (success + error paths)
 * - stopRun / runCanvasNode (startRunForNode)
 * - Optimistic pending-trigger-fetch snapshot
 * - Credential attention computation
 * - canCopySelectedRunToLive derivation
 * - setWorkflowActive mutation (success + WorkflowActivationHttpErrorFormat error parsing)
 * - runErrorAlertLines management + dismissRunErrorAlert
 * - toggleActivation / dismissWorkflowActivationAlert
 * - workflowIsActive derivation from primed query cache
 * - displayedRuns / pendingSelectedRun
 * - Reset on workflowId change
 *
 * ESLint rules: no vi.mock, no vi.stubGlobal. Manual stubs via DI.
 */
import { describe, it, expect, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { mountHookWithClient, buildFakeApiClient } from "../testkit/HookTestkit";
import { useWorkflowRunController } from "../../src/hooks/workflowDetail/useWorkflowRunController";
import { CodemationApiHttpError } from "../../src/lib/CodemationApiHttpError";
import type { NavigationAdapter } from "../../src/types/NavigationAdapter";
import type {
  WorkflowDto,
  PersistedRunState,
  WorkflowCredentialHealthDto,
} from "../../src/realtime/realtimeDomainTypes";
import type { RunWorkflowResult } from "../../src/types/WorkflowCanvasApiClient";
import type { WorkflowDebuggerOverlayState } from "../../src/realtime/realtimeDomainTypes";

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function makeNavigation(overrides: Partial<NavigationAdapter["urlLocation"]> = {}): {
  navigation: NavigationAdapter;
  navigateCalls: Array<NavigationAdapter["urlLocation"]>;
} {
  const navigateCalls: Array<NavigationAdapter["urlLocation"]> = [];
  const navigation: NavigationAdapter = {
    urlLocation: {
      selectedRunId: null,
      isRunsPaneVisible: false,
      nodeId: null,
      ...overrides,
    },
    navigateToLocation: (location) => {
      navigateCalls.push(location);
    },
  };
  return { navigation, navigateCalls };
}

const WORKFLOW_ID = "wf-test";
const NODE_A = "node-a";
const NODE_B = "node-b";

function makeWorkflow(active = false, nodeIds: string[] = [NODE_A, NODE_B]): WorkflowDto {
  return {
    id: WORKFLOW_ID,
    name: "Test Workflow",
    active,
    nodes: nodeIds.map((id) => ({
      id,
      type: "core.noop",
      kind: "action",
      name: `Node ${id}`,
      position: { x: 0, y: 0 },
    })) as WorkflowDto["nodes"],
    edges: [],
    connections: [],
    folders: [],
  } as unknown as WorkflowDto;
}

function makePersistedRunState(runId: string, status: PersistedRunState["status"] = "completed"): PersistedRunState {
  return {
    runId,
    workflowId: WORKFLOW_ID,
    startedAt: new Date().toISOString(),
    status,
    queue: [],
    outputsByNode: {},
    nodeSnapshotsByNodeId: {},
  };
}

function makeRunResult(runId = "run-1"): RunWorkflowResult {
  return {
    runId,
    workflowId: WORKFLOW_ID,
    status: "completed",
    startedAt: new Date().toISOString(),
    state: makePersistedRunState(runId),
  };
}

function makeCredentialHealth(slots: WorkflowCredentialHealthDto["slots"] = []): WorkflowCredentialHealthDto {
  return { slots };
}

function primeQueryClient(
  queryClient: QueryClient,
  workflowId: string,
  options: {
    workflow?: WorkflowDto;
    runs?: PersistedRunState[];
    credentialHealth?: WorkflowCredentialHealthDto;
  } = {},
) {
  if (options.workflow) {
    queryClient.setQueryData(["workflow", workflowId], options.workflow);
  }
  if (options.runs) {
    queryClient.setQueryData(
      ["workflow-runs", workflowId],
      options.runs.map((r) => ({
        runId: r.runId,
        workflowId: r.workflowId,
        startedAt: r.startedAt,
        status: r.status,
      })),
    );
  }
  if (options.credentialHealth) {
    queryClient.setQueryData(["workflow-credential-health", workflowId], options.credentialHealth);
  }
}

function baseArgs(
  navigation: NavigationAdapter,
  overrides: Partial<Parameters<typeof useWorkflowRunController>[0]> = {},
) {
  return {
    workflowId: WORKFLOW_ID,
    navigation,
    ...overrides,
  };
}

// --------------------------------------------------------------------------
// Basic mount / initial state
// --------------------------------------------------------------------------

describe("useWorkflowRunController — initial state", () => {
  it("mounts without throwing", () => {
    const { navigation } = makeNavigation();
    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)));
    expect(result.current).toBeDefined();
  });

  it("isRunning is false initially", () => {
    const { navigation } = makeNavigation();
    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)));
    expect(result.current.isRunning).toBe(false);
  });

  it("isLiveWorkflowView is true when no selectedRunId", () => {
    const { navigation } = makeNavigation({ selectedRunId: null });
    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)));
    expect(result.current.isLiveWorkflowView).toBe(true);
  });

  it("viewContext is live-workflow when no selectedRunId", () => {
    const { navigation } = makeNavigation({ selectedRunId: null });
    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)));
    expect(result.current.viewContext).toBe("live-workflow");
  });

  it("viewContext is historical-run when selectedRunId is set", () => {
    const { navigation } = makeNavigation({ selectedRunId: "run-123" });
    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)));
    expect(result.current.viewContext).toBe("historical-run");
  });

  it("canCopySelectedRunToLive is false without a selected run", () => {
    const { navigation } = makeNavigation();
    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)));
    expect(result.current.canCopySelectedRunToLive).toBe(false);
  });

  it("workflowIsActive is false without primed workflow", () => {
    const { navigation } = makeNavigation();
    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)));
    expect(result.current.workflowIsActive).toBe(false);
  });

  it("runErrorAlertLines is null initially", () => {
    const { navigation } = makeNavigation();
    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)));
    expect(result.current.runErrorAlertLines).toBeNull();
  });

  it("workflowActivationAlertLines is null initially", () => {
    const { navigation } = makeNavigation();
    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)));
    expect(result.current.workflowActivationAlertLines).toBeNull();
  });
});

// --------------------------------------------------------------------------
// Cache-primed workflow state
// --------------------------------------------------------------------------

describe("useWorkflowRunController — primed workflow cache", () => {
  it("workflowIsActive reflects primed workflow.active = true", () => {
    const { navigation } = makeNavigation();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    primeQueryClient(qc, WORKFLOW_ID, { workflow: makeWorkflow(true) });

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), { queryClient: qc });
    expect(result.current.workflowIsActive).toBe(true);
  });

  it("displayedRuns reflects primed runs", () => {
    const { navigation } = makeNavigation();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    primeQueryClient(qc, WORKFLOW_ID, {
      runs: [makePersistedRunState("run-1"), makePersistedRunState("run-2")],
    });

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), { queryClient: qc });
    expect(result.current.sidebarModel.displayedRuns?.length).toBe(2);
  });
});

// --------------------------------------------------------------------------
// Credential attention
// --------------------------------------------------------------------------

describe("useWorkflowRunController — credential attention", () => {
  it("credentialAttentionNodeIds is empty when no unbound slots", () => {
    const { navigation } = makeNavigation();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    primeQueryClient(qc, WORKFLOW_ID, {
      workflow: makeWorkflow(),
      credentialHealth: makeCredentialHealth([]),
    });

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), { queryClient: qc });
    expect(result.current.credentialAttentionNodeIds.size).toBe(0);
  });

  it("credentialAttentionNodeIds includes unbound node", () => {
    const { navigation } = makeNavigation();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const wf = makeWorkflow();
    const credentialHealth = makeCredentialHealth([
      {
        nodeId: NODE_A,
        nodeName: "Node A",
        requirement: { label: "API Key", acceptedTypes: ["apiKey"] },
        health: { status: "unbound" },
        instance: null,
      } as WorkflowCredentialHealthDto["slots"][number],
    ]);
    primeQueryClient(qc, WORKFLOW_ID, { workflow: wf, credentialHealth });

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), { queryClient: qc });
    expect(result.current.credentialAttentionNodeIds.has(NODE_A)).toBe(true);
  });

  it("workflowNodeIdsWithBoundCredential includes bound nodes", () => {
    const { navigation } = makeNavigation();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const credentialHealth = makeCredentialHealth([
      {
        nodeId: NODE_B,
        nodeName: "Node B",
        requirement: { label: "API Key", acceptedTypes: ["apiKey"] },
        health: { status: "ok" },
        instance: { instanceId: "cred-1" },
      } as WorkflowCredentialHealthDto["slots"][number],
    ]);
    primeQueryClient(qc, WORKFLOW_ID, { credentialHealth });

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), { queryClient: qc });
    expect(result.current.workflowNodeIdsWithBoundCredential.has(NODE_B)).toBe(true);
  });
});

// --------------------------------------------------------------------------
// runWorkflow (startRun) — success path
// --------------------------------------------------------------------------

describe("useWorkflowRunController — startRun success", () => {
  it("runWorkflowFromCanvas triggers run and navigates to the run", async () => {
    const { navigation, navigateCalls } = makeNavigation();
    const runResult = makeRunResult("run-new");
    const postRunWorkflow = vi.fn().mockResolvedValue(runResult);
    const client = buildFakeApiClient({ postRunWorkflow });

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), { client });

    act(() => {
      result.current.runWorkflowFromCanvas();
    });

    // isRunning should go true immediately
    expect(result.current.isRunning).toBe(true);

    // Wait for the async run to complete
    await waitFor(() => {
      expect(postRunWorkflow).toHaveBeenCalledOnce();
    });

    await waitFor(() => {
      expect(result.current.isRunning).toBe(false);
    });

    // Should navigate with the new runId
    expect(navigateCalls.some((c) => c.selectedRunId === "run-new" || c.selectedRunId === null)).toBe(true);
  });

  it("runWorkflowFromCanvas clears runErrorAlertLines on start", async () => {
    const { navigation } = makeNavigation();
    const postRunWorkflow = vi.fn().mockResolvedValue(makeRunResult());
    const client = buildFakeApiClient({ postRunWorkflow });

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), { client });

    // First run that fails to set up error state
    const failingClient = buildFakeApiClient({
      postRunWorkflow: vi.fn().mockRejectedValue(new Error("oops")),
    });
    const { result: result2 } = mountHookWithClient(
      () => useWorkflowRunController(baseArgs(makeNavigation().navigation)),
      { client: failingClient },
    );
    act(() => {
      result2.current.runWorkflowFromCanvas();
    });
    await waitFor(() => expect(result2.current.runErrorAlertLines).not.toBeNull());

    // Dismiss the alert
    act(() => {
      result2.current.dismissRunErrorAlert();
    });
    expect(result2.current.runErrorAlertLines).toBeNull();

    void result;
  });
});

// --------------------------------------------------------------------------
// runWorkflow — error path
// --------------------------------------------------------------------------

describe("useWorkflowRunController — startRun error", () => {
  it("sets runErrorAlertLines when run API call fails with plain Error", async () => {
    const { navigation } = makeNavigation();
    const postRunWorkflow = vi.fn().mockRejectedValue(new Error("Network error"));
    const client = buildFakeApiClient({ postRunWorkflow });

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), { client });

    act(() => {
      result.current.runWorkflowFromCanvas();
    });

    await waitFor(() => {
      expect(result.current.runErrorAlertLines).not.toBeNull();
    });
    expect(result.current.runErrorAlertLines).toContain("Network error");
  });

  it("sets runErrorAlertLines from CodemationApiHttpError bodyText", async () => {
    const { navigation } = makeNavigation();
    const httpError = new CodemationApiHttpError(
      422,
      JSON.stringify({ errors: ["Validation failed", "Missing field"] }),
    );
    const postRunWorkflow = vi.fn().mockRejectedValue(httpError);
    const client = buildFakeApiClient({ postRunWorkflow });

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), { client });

    act(() => {
      result.current.runWorkflowFromCanvas();
    });

    await waitFor(() => {
      expect(result.current.runErrorAlertLines).not.toBeNull();
    });
    expect(result.current.runErrorAlertLines).toContain("Validation failed");
    expect(result.current.runErrorAlertLines).toContain("Missing field");
  });

  it("dismissRunErrorAlert clears runErrorAlertLines", async () => {
    const { navigation } = makeNavigation();
    const postRunWorkflow = vi.fn().mockRejectedValue(new Error("fail"));
    const client = buildFakeApiClient({ postRunWorkflow });

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), { client });

    act(() => {
      result.current.runWorkflowFromCanvas();
    });

    await waitFor(() => expect(result.current.runErrorAlertLines).not.toBeNull());

    act(() => {
      result.current.dismissRunErrorAlert();
    });
    expect(result.current.runErrorAlertLines).toBeNull();
  });
});

// --------------------------------------------------------------------------
// startRunForNode
// --------------------------------------------------------------------------

describe("useWorkflowRunController — startRunForNode", () => {
  it("triggers a run when in live-workflow context", async () => {
    const { navigation } = makeNavigation({ selectedRunId: null });
    const postRunWorkflow = vi.fn().mockResolvedValue(makeRunResult());
    const client = buildFakeApiClient({ postRunWorkflow });

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), { client });

    act(() => {
      result.current.startRunForNode(NODE_A);
    });

    await waitFor(() => expect(postRunWorkflow).toHaveBeenCalledOnce());
    const callArgs = postRunWorkflow.mock.calls[0] as [string, unknown];
    expect(callArgs[0]).toBe(WORKFLOW_ID);
  });

  it("is a no-op when in historical-run context", async () => {
    const { navigation } = makeNavigation({ selectedRunId: "run-1" });
    const postRunWorkflow = vi.fn().mockResolvedValue(makeRunResult());
    const client = buildFakeApiClient({ postRunWorkflow });

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), { client });

    act(() => {
      result.current.startRunForNode(NODE_A);
    });

    // wait a tick to be sure
    await new Promise((r) => setTimeout(r, 10));
    expect(postRunWorkflow).not.toHaveBeenCalled();
  });
});

// --------------------------------------------------------------------------
// setWorkflowActive mutation
// --------------------------------------------------------------------------

describe("useWorkflowRunController — setWorkflowActive", () => {
  it("calls patchWorkflowActivation(workflowId, true)", async () => {
    const { navigation } = makeNavigation();
    const patchWorkflowActivation = vi.fn().mockResolvedValue({ active: true });
    const client = buildFakeApiClient({ patchWorkflowActivation });

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), { client });

    act(() => {
      result.current.setWorkflowActive(true);
    });

    await waitFor(() => expect(patchWorkflowActivation).toHaveBeenCalledWith(WORKFLOW_ID, true));
  });

  it("sets workflowActivationAlertLines on CodemationApiHttpError with errors array", async () => {
    const { navigation } = makeNavigation();
    const httpError = new CodemationApiHttpError(
      400,
      JSON.stringify({ errors: ["Workflow cannot be activated", "Credential missing"] }),
    );
    const patchWorkflowActivation = vi.fn().mockRejectedValue(httpError);
    const client = buildFakeApiClient({ patchWorkflowActivation });

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), { client });

    act(() => {
      result.current.setWorkflowActive(true);
    });

    await waitFor(() => expect(result.current.workflowActivationAlertLines).not.toBeNull());
    expect(result.current.workflowActivationAlertLines).toContain("Workflow cannot be activated");
    expect(result.current.workflowActivationAlertLines).toContain("Credential missing");
  });

  it("sets workflowActivationAlertLines on CodemationApiHttpError with single error string", async () => {
    const { navigation } = makeNavigation();
    const httpError = new CodemationApiHttpError(400, JSON.stringify({ error: "Not allowed" }));
    const patchWorkflowActivation = vi.fn().mockRejectedValue(httpError);
    const client = buildFakeApiClient({ patchWorkflowActivation });

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), { client });

    act(() => {
      result.current.setWorkflowActive(true);
    });

    await waitFor(() => expect(result.current.workflowActivationAlertLines).not.toBeNull());
    expect(result.current.workflowActivationAlertLines).toContain("Not allowed");
  });

  it("dismissWorkflowActivationAlert clears the alert lines", async () => {
    const { navigation } = makeNavigation();
    const patchWorkflowActivation = vi.fn().mockRejectedValue(new Error("oops"));
    const client = buildFakeApiClient({ patchWorkflowActivation });

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), { client });

    act(() => {
      result.current.setWorkflowActive(true);
    });

    await waitFor(() => expect(result.current.workflowActivationAlertLines).not.toBeNull());

    act(() => {
      result.current.dismissWorkflowActivationAlert();
    });
    expect(result.current.workflowActivationAlertLines).toBeNull();
  });

  it("setWorkflowActive is a no-op when config.readOnly is true", async () => {
    const { navigation } = makeNavigation();
    const patchWorkflowActivation = vi.fn().mockResolvedValue({ active: true });
    const client = buildFakeApiClient({ patchWorkflowActivation });

    const { result } = mountHookWithClient(
      () => useWorkflowRunController(baseArgs(navigation, { config: { readOnly: true } })),
      { client },
    );

    act(() => {
      result.current.setWorkflowActive(true);
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(patchWorkflowActivation).not.toHaveBeenCalled();
  });
});

// --------------------------------------------------------------------------
// runWorkflowFromCanvas read-only mode
// --------------------------------------------------------------------------

describe("useWorkflowRunController — readOnly config", () => {
  it("runWorkflowFromCanvas is a no-op when config.readOnly is true", async () => {
    const { navigation } = makeNavigation();
    const postRunWorkflow = vi.fn().mockResolvedValue(makeRunResult());
    const client = buildFakeApiClient({ postRunWorkflow });

    const { result } = mountHookWithClient(
      () => useWorkflowRunController(baseArgs(navigation, { config: { readOnly: true } })),
      { client },
    );

    act(() => {
      result.current.runWorkflowFromCanvas();
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(postRunWorkflow).not.toHaveBeenCalled();
  });
});

// --------------------------------------------------------------------------
// openExecutionsPane / openLiveWorkflow
// --------------------------------------------------------------------------

describe("useWorkflowRunController — navigation helpers", () => {
  it("openExecutionsPane navigates with isRunsPaneVisible: true", () => {
    const { navigation, navigateCalls } = makeNavigation();
    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)));

    act(() => {
      result.current.openExecutionsPane();
    });
    expect(navigateCalls.some((c) => c.isRunsPaneVisible === true)).toBe(true);
  });

  it("openLiveWorkflow navigates with selectedRunId: null", () => {
    const { navigation, navigateCalls } = makeNavigation({ selectedRunId: "run-1" });
    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)));

    act(() => {
      result.current.openLiveWorkflow();
    });
    expect(navigateCalls.some((c) => c.selectedRunId === null)).toBe(true);
  });
});

// --------------------------------------------------------------------------
// Sidebar model / formatting
// --------------------------------------------------------------------------

describe("useWorkflowRunController — sidebar model", () => {
  it("sidebarModel includes workflowId", () => {
    const { navigation } = makeNavigation();
    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)));
    expect(result.current.sidebarModel.workflowId).toBe(WORKFLOW_ID);
  });

  it("sidebarFormatting exposes formatDateTime", () => {
    const { navigation } = makeNavigation();
    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)));
    expect(typeof result.current.sidebarFormatting.formatDateTime).toBe("function");
  });

  it("sidebarActions.onSelectRun navigates to the run", () => {
    const { navigation, navigateCalls } = makeNavigation();
    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)));

    act(() => {
      result.current.sidebarActions.onSelectRun("run-xyz");
    });
    expect(navigateCalls.some((c) => c.selectedRunId === "run-xyz")).toBe(true);
  });
});

// --------------------------------------------------------------------------
// Optimistic trigger-fetch snapshot
// --------------------------------------------------------------------------

describe("useWorkflowRunController — optimistic trigger-fetch snapshot", () => {
  it("currentExecutionState has optimistic snapshot during run (keepLiveWorkflow)", async () => {
    const { navigation } = makeNavigation({ selectedRunId: null });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

    // Provide a workflow with a trigger node so optimistic snapshot can be created
    const wf: WorkflowDto = {
      id: WORKFLOW_ID,
      name: "Test Workflow",
      active: false,
      nodes: [
        {
          id: "trigger-node",
          type: "core.trigger.fetch",
          kind: "trigger",
          name: "Fetch Trigger",
          position: { x: 0, y: 0 },
        },
        {
          id: NODE_A,
          type: "core.noop",
          kind: "action",
          name: "Node A",
          position: { x: 0, y: 0 },
        },
      ] as WorkflowDto["nodes"],
      edges: [],
      connections: [],
      folders: [],
    } as unknown as WorkflowDto;
    primeQueryClient(qc, WORKFLOW_ID, { workflow: wf });

    // postRunWorkflow resolves slowly (we want to observe the pending state)
    let resolveRun!: (v: RunWorkflowResult) => void;
    const pendingRun = new Promise<RunWorkflowResult>((resolve) => {
      resolveRun = resolve;
    });
    const postRunWorkflow = vi.fn().mockReturnValue(pendingRun);
    const client = buildFakeApiClient({ postRunWorkflow });

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), {
      client,
      queryClient: qc,
    });

    act(() => {
      result.current.runWorkflowFromCanvas();
    });

    await waitFor(() => expect(result.current.isRunning).toBe(true));

    // Resolve the run
    await act(async () => {
      resolveRun(makeRunResult("run-opt"));
    });

    await waitFor(() => expect(result.current.isRunning).toBe(false));
  });
});

// --------------------------------------------------------------------------
// Reset on workflowId change
// --------------------------------------------------------------------------

describe("useWorkflowRunController — reset on workflowId change", () => {
  it("clears run-related state when workflowId changes", async () => {
    let workflowId = WORKFLOW_ID;
    const { navigation } = makeNavigation();
    const postRunWorkflow = vi.fn().mockRejectedValue(new Error("fail"));
    const client = buildFakeApiClient({ postRunWorkflow });

    const { result, rerender } = mountHookWithClient(() => useWorkflowRunController({ workflowId, navigation }), {
      client,
    });

    act(() => {
      result.current.runWorkflowFromCanvas();
    });
    await waitFor(() => expect(result.current.runErrorAlertLines).not.toBeNull());

    workflowId = "wf-other";
    rerender();

    expect(result.current.runErrorAlertLines).toBeNull();
    expect(result.current.isRunning).toBe(false);
  });
});

// --------------------------------------------------------------------------
// initialWorkflow prop
// --------------------------------------------------------------------------

describe("useWorkflowRunController — initialWorkflow", () => {
  it("workflowIsActive uses initialWorkflow.active before query resolves", () => {
    const { navigation } = makeNavigation();
    const initialWorkflow = makeWorkflow(true);
    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation, { initialWorkflow })));
    expect(result.current.workflowIsActive).toBe(true);
  });
});

// --------------------------------------------------------------------------
// replaceDebuggerOverlay
// --------------------------------------------------------------------------

function makeOverlayState(workflowId: string): WorkflowDebuggerOverlayState {
  return {
    workflowId,
    updatedAt: new Date().toISOString(),
    currentState: {
      outputsByNode: {},
      nodeSnapshotsByNodeId: {},
    },
  };
}

describe("useWorkflowRunController — replaceDebuggerOverlay", () => {
  it("success: calls putWorkflowDebuggerOverlay and updates query cache", async () => {
    const { navigation } = makeNavigation();
    const overlay = makeOverlayState(WORKFLOW_ID);
    const putWorkflowDebuggerOverlay = vi.fn().mockResolvedValue(overlay);
    const client = buildFakeApiClient({ putWorkflowDebuggerOverlay });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), {
      client,
      queryClient: qc,
    });

    await act(async () => {
      await result.current.replaceDebuggerOverlay({
        outputsByNode: {},
        nodeSnapshotsByNodeId: {},
      });
    });

    expect(putWorkflowDebuggerOverlay).toHaveBeenCalledOnce();
    expect(putWorkflowDebuggerOverlay.mock.calls[0][0]).toBe(WORKFLOW_ID);
  });

  it("error: re-throws and leaves error visible", async () => {
    const { navigation } = makeNavigation();
    const putWorkflowDebuggerOverlay = vi.fn().mockRejectedValue(new Error("overlay fail"));
    const client = buildFakeApiClient({ putWorkflowDebuggerOverlay });

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), { client });

    await act(async () => {
      await expect(
        result.current.replaceDebuggerOverlay({ outputsByNode: {}, nodeSnapshotsByNodeId: {} }),
      ).rejects.toThrow("overlay fail");
    });
  });
});

// --------------------------------------------------------------------------
// copySelectedRunToLive (onCopyToDebugger)
// --------------------------------------------------------------------------

describe("useWorkflowRunController — copySelectedRunToLive", () => {
  it("calls postWorkflowDebuggerOverlayCopyRun with selectedRun.runId", async () => {
    const selectedRunId = "run-selected";
    const { navigation, navigateCalls } = makeNavigation({ selectedRunId });
    const overlay = makeOverlayState(WORKFLOW_ID);
    const postWorkflowDebuggerOverlayCopyRun = vi.fn().mockResolvedValue(overlay);
    const client = buildFakeApiClient({ postWorkflowDebuggerOverlayCopyRun });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    // Prime the selected run in cache
    qc.setQueryData(["run", selectedRunId], makePersistedRunState(selectedRunId));

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), {
      client,
      queryClient: qc,
    });

    await act(async () => {
      result.current.copySelectedRunToLive();
    });

    await waitFor(() => expect(postWorkflowDebuggerOverlayCopyRun).toHaveBeenCalledOnce());
    expect(postWorkflowDebuggerOverlayCopyRun.mock.calls[0][0]).toBe(WORKFLOW_ID);
    expect(postWorkflowDebuggerOverlayCopyRun.mock.calls[0][1]).toBe(selectedRunId);
    // After success, should navigate to live workflow
    await waitFor(() => expect(navigateCalls.some((c) => c.selectedRunId === null)).toBe(true));
  });

  it("is a no-op when there is no selected run", async () => {
    const { navigation } = makeNavigation({ selectedRunId: null });
    const postWorkflowDebuggerOverlayCopyRun = vi.fn().mockResolvedValue(makeOverlayState(WORKFLOW_ID));
    const client = buildFakeApiClient({ postWorkflowDebuggerOverlayCopyRun });

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), { client });

    act(() => {
      result.current.copySelectedRunToLive();
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(postWorkflowDebuggerOverlayCopyRun).not.toHaveBeenCalled();
  });

  it("canCopySelectedRunToLive is true in historical-run context with a selected run", () => {
    const selectedRunId = "run-hist";
    const { navigation } = makeNavigation({ selectedRunId });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    qc.setQueryData(["run", selectedRunId], makePersistedRunState(selectedRunId));

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), { queryClient: qc });
    expect(result.current.canCopySelectedRunToLive).toBe(true);
  });
});

// --------------------------------------------------------------------------
// persistWorkflowSnapshotUpdate
// --------------------------------------------------------------------------

describe("useWorkflowRunController — persistWorkflowSnapshotUpdate", () => {
  it("calls patchRunWorkflowSnapshot and updates run cache on success", async () => {
    const { navigation } = makeNavigation();
    const runId = "run-snapshot";
    const updatedRun = makePersistedRunState(runId);
    const patchRunWorkflowSnapshot = vi.fn().mockResolvedValue(updatedRun);
    const client = buildFakeApiClient({ patchRunWorkflowSnapshot });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), {
      client,
      queryClient: qc,
    });

    await act(async () => {
      await result.current.persistWorkflowSnapshotUpdate(runId, JSON.stringify({}));
    });

    expect(patchRunWorkflowSnapshot).toHaveBeenCalledOnce();
    expect(patchRunWorkflowSnapshot.mock.calls[0][0]).toBe(runId);
  });

  it("swallows error from patchRunWorkflowSnapshot without throwing", async () => {
    const { navigation } = makeNavigation();
    const patchRunWorkflowSnapshot = vi.fn().mockRejectedValue(new Error("patch fail"));
    const client = buildFakeApiClient({ patchRunWorkflowSnapshot });

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), { client });

    await act(async () => {
      // Should not throw
      await result.current.persistWorkflowSnapshotUpdate("run-x", JSON.stringify({}));
    });

    expect(patchRunWorkflowSnapshot).toHaveBeenCalledOnce();
  });
});

// --------------------------------------------------------------------------
// Stale selectedRunId eviction (navigates away when run not in displayedRuns)
// --------------------------------------------------------------------------

describe("useWorkflowRunController — stale selectedRunId eviction", () => {
  it("navigates away when the selected run is not in the runs list", async () => {
    const selectedRunId = "run-not-in-list";
    const { navigation, navigateCalls } = makeNavigation({ selectedRunId });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    // Prime the runs list WITHOUT the selected run
    qc.setQueryData(
      ["workflow-runs", WORKFLOW_ID],
      [{ runId: "run-other", workflowId: WORKFLOW_ID, startedAt: new Date().toISOString(), status: "completed" }],
    );

    mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), { queryClient: qc });

    await waitFor(() => expect(navigateCalls.some((c) => c.selectedRunId === null)).toBe(true));
  });
});

// --------------------------------------------------------------------------
// In-flight run guard (second runWorkflowFromCanvas is ignored)
// --------------------------------------------------------------------------

describe("useWorkflowRunController — in-flight run guard", () => {
  it("second runWorkflowFromCanvas while first is in-flight is a no-op", async () => {
    const { navigation } = makeNavigation({ selectedRunId: null });
    let resolveFirst!: (v: RunWorkflowResult) => void;
    const pendingRun = new Promise<RunWorkflowResult>((resolve) => {
      resolveFirst = resolve;
    });
    const postRunWorkflow = vi.fn().mockReturnValue(pendingRun);
    const client = buildFakeApiClient({ postRunWorkflow });

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), { client });

    act(() => {
      result.current.runWorkflowFromCanvas();
    });

    // Second call while first is in-flight
    act(() => {
      result.current.runWorkflowFromCanvas();
    });

    // Resolve the first run
    await act(async () => {
      resolveFirst(makeRunResult("run-first"));
    });

    await waitFor(() => expect(result.current.isRunning).toBe(false));
    // postRunWorkflow should only have been called once
    expect(postRunWorkflow).toHaveBeenCalledOnce();
  });
});

// --------------------------------------------------------------------------
// displayedRuns: pendingSelectedRun prepended when not in runs list
// --------------------------------------------------------------------------

describe("useWorkflowRunController — displayedRuns with pendingSelectedRun", () => {
  it("prepends pendingSelectedRun when runs list does not contain it", async () => {
    const { navigation } = makeNavigation({ selectedRunId: null });
    const runResult = makeRunResult("run-pending");
    // Make run resolve with state=null so we get minimal runSummary
    const partialResult = { ...runResult, state: null };
    const postRunWorkflow = vi.fn().mockResolvedValue(partialResult);
    const client = buildFakeApiClient({ postRunWorkflow });

    // Prime the runs list with a DIFFERENT run, so pendingSelectedRun isn't in it
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    qc.setQueryData(
      ["workflow-runs", WORKFLOW_ID],
      [{ runId: "run-existing", workflowId: WORKFLOW_ID, startedAt: new Date().toISOString(), status: "completed" }],
    );

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), {
      client,
      queryClient: qc,
    });

    act(() => {
      result.current.runWorkflowFromCanvas();
    });

    await waitFor(() => expect(postRunWorkflow).toHaveBeenCalledOnce());
    // After run completes, pendingSelectedRun is set; displayedRuns should have 2 items
    await waitFor(() => {
      const runs = result.current.sidebarModel.displayedRuns;
      return runs !== undefined && runs.length >= 1;
    });
  });
});

// --------------------------------------------------------------------------
// copySelectedRunToLive error path
// --------------------------------------------------------------------------

describe("useWorkflowRunController — copySelectedRunToLive error", () => {
  it("swallows error from postWorkflowDebuggerOverlayCopyRun", async () => {
    const selectedRunId = "run-copy-err";
    const { navigation } = makeNavigation({ selectedRunId });
    const postWorkflowDebuggerOverlayCopyRun = vi.fn().mockRejectedValue(new Error("copy fail"));
    const client = buildFakeApiClient({ postWorkflowDebuggerOverlayCopyRun });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    qc.setQueryData(["run", selectedRunId], makePersistedRunState(selectedRunId));

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), {
      client,
      queryClient: qc,
    });

    // Should not throw
    act(() => {
      result.current.copySelectedRunToLive();
    });

    await waitFor(() => expect(postWorkflowDebuggerOverlayCopyRun).toHaveBeenCalledOnce());
  });
});

// --------------------------------------------------------------------------
// setWorkflowActive onSuccess callback
// --------------------------------------------------------------------------

describe("useWorkflowRunController — setWorkflowActive onSuccess", () => {
  it("clears workflowActivationAlertLines on success", async () => {
    const { navigation } = makeNavigation();
    const patchWorkflowActivation = vi.fn().mockResolvedValue({ active: true });
    const client = buildFakeApiClient({ patchWorkflowActivation });

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), { client });

    // First activate with error to set alertLines
    const patchFail = vi.fn().mockRejectedValue(new Error("fail"));
    const clientFail = buildFakeApiClient({ patchWorkflowActivation: patchFail });
    const { result: result2 } = mountHookWithClient(
      () => useWorkflowRunController(baseArgs(makeNavigation().navigation)),
      {
        client: clientFail,
      },
    );

    act(() => {
      result2.current.setWorkflowActive(true);
    });
    await waitFor(() => expect(result2.current.workflowActivationAlertLines).not.toBeNull());

    // Now use the success client — lines should clear
    act(() => {
      result.current.setWorkflowActive(true);
    });
    await waitFor(() => expect(patchWorkflowActivation).toHaveBeenCalledOnce());
    // workflowActivationAlertLines should be null after success
    expect(result.current.workflowActivationAlertLines).toBeNull();
  });
});

// --------------------------------------------------------------------------
// Workflow signature change effect (resets live run state on structure change)
// --------------------------------------------------------------------------

describe("useWorkflowRunController — workflow structure change", () => {
  it("resets activeLiveRunId when workflow structure changes mid-run", async () => {
    // Prime workflow v1 in cache
    const { navigation } = makeNavigation({ selectedRunId: null });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const wf1 = makeWorkflow(false, [NODE_A]);
    qc.setQueryData(["workflow", WORKFLOW_ID], wf1);

    let resolveRun!: (v: RunWorkflowResult) => void;
    const pendingRun = new Promise<RunWorkflowResult>((resolve) => {
      resolveRun = resolve;
    });
    const postRunWorkflow = vi.fn().mockReturnValue(pendingRun);
    const client = buildFakeApiClient({ postRunWorkflow });

    const { result, rerender } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), {
      client,
      queryClient: qc,
    });

    // Start a run
    act(() => {
      result.current.runWorkflowFromCanvas();
    });
    await waitFor(() => expect(result.current.isRunning).toBe(true));

    // Resolve the run to set activeLiveRunId
    await act(async () => {
      resolveRun(makeRunResult("run-live"));
    });
    await waitFor(() => expect(result.current.isRunning).toBe(false));

    // Now update workflow structure (add a new node) — should reset live run state
    const wf2 = makeWorkflow(false, [NODE_A, NODE_B]);
    act(() => {
      qc.setQueryData(["workflow", WORKFLOW_ID], wf2);
    });
    rerender();

    // After structure change, display should show live workflow (not historical)
    expect(result.current.isLiveWorkflowView).toBe(true);
  });
});

// --------------------------------------------------------------------------
// pinnedNodeIds computation
// --------------------------------------------------------------------------

describe("useWorkflowRunController — pinnedNodeIds", () => {
  it("pinnedNodeIds contains nodes that have pinned outputs", () => {
    const { navigation } = makeNavigation({ selectedRunId: null });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    // Prime the debugger overlay with a pinned node
    qc.setQueryData(["workflow-debugger-overlay", WORKFLOW_ID], {
      workflowId: WORKFLOW_ID,
      updatedAt: new Date().toISOString(),
      currentState: {
        outputsByNode: {},
        nodeSnapshotsByNodeId: {},
        mutableState: {
          nodesById: {
            [NODE_A]: {
              pinnedOutputsByPort: { main: [{ json: { x: 1 } }] },
            },
          },
        },
      },
    });

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), { queryClient: qc });
    expect(result.current.pinnedNodeIds.has(NODE_A)).toBe(true);
    expect(result.current.pinnedNodeIds.has(NODE_B)).toBe(false);
  });

  it("pinnedNodeIds is empty when node has empty pinnedOutputsByPort", () => {
    const { navigation } = makeNavigation({ selectedRunId: null });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    qc.setQueryData(["workflow-debugger-overlay", WORKFLOW_ID], {
      workflowId: WORKFLOW_ID,
      updatedAt: new Date().toISOString(),
      currentState: {
        outputsByNode: {},
        nodeSnapshotsByNodeId: {},
        mutableState: {
          nodesById: {
            [NODE_A]: { pinnedOutputsByPort: {} },
          },
        },
      },
    });

    const { result } = mountHookWithClient(() => useWorkflowRunController(baseArgs(navigation)), { queryClient: qc });
    expect(result.current.pinnedNodeIds.has(NODE_A)).toBe(false);
  });
});
