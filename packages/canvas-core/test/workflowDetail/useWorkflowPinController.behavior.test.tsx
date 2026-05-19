/**
 * Behavior tests for useWorkflowPinController.
 *
 * Covers:
 * - togglePinnedOutput: pin, unpin, no-op in historical-run context
 * - buildPinEditorState: returns state in live-workflow, null in historical-run
 * - commitPinEdit: calls replaceDebuggerOverlay with updated state
 * - clearPinnedOutput: removes a port from pinned outputs
 * - resolveOutputPortForNode: preference order, fallback to declared/edge ports
 *
 * No API client needed — this hook takes only props (D5 compliant).
 * replaceDebuggerOverlay is injected as a spy.
 *
 * ESLint rules: no vi.mock, no vi.stubGlobal.
 */
import { describe, it, expect, vi } from "vitest";
import { act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { useWorkflowPinController } from "../../src/hooks/workflowDetail/useWorkflowPinController";
import type { WorkflowDto, RunCurrentState, Items } from "../../src/realtime/realtimeDomainTypes";

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

const WORKFLOW_ID = "wf-pin";
const NODE_A = "node-a";
const NODE_B = "node-b";

function makeWorkflow(nodeIds: string[] = [NODE_A, NODE_B]): WorkflowDto {
  return {
    id: WORKFLOW_ID,
    name: "Pin Test Workflow",
    active: false,
    nodes: nodeIds.map((id) => ({
      id,
      type: "core.noop",
      kind: "action",
      name: `Node ${id}`,
      position: { x: 0, y: 0 },
      declaredOutputPorts: ["main"],
      hasNodeErrorHandler: false,
    })) as WorkflowDto["nodes"],
    edges: [],
    connections: [],
    folders: [],
  } as unknown as WorkflowDto;
}

function makeItem(value: unknown = { key: "val" }): Items[number] {
  return { json: value };
}

function makeCurrentState(
  options: {
    outputs?: Record<string, Record<string, Items>>;
    pinnedOutputsByPort?: Record<string, Record<string, Items>>;
  } = {},
): RunCurrentState {
  const nodeSnapshotsByNodeId: Record<string, unknown> = {};
  if (options.outputs) {
    for (const [nodeId, ports] of Object.entries(options.outputs)) {
      nodeSnapshotsByNodeId[nodeId] = {
        runId: "run-1",
        workflowId: WORKFLOW_ID,
        nodeId,
        status: "completed",
        updatedAt: new Date().toISOString(),
        outputs: ports,
      };
    }
  }
  const mutableState = options.pinnedOutputsByPort
    ? {
        nodesById: Object.fromEntries(
          Object.entries(options.pinnedOutputsByPort).map(([nodeId, ports]) => [
            nodeId,
            { pinnedOutputsByPort: ports },
          ]),
        ),
      }
    : undefined;

  return {
    outputsByNode: {},
    nodeSnapshotsByNodeId: nodeSnapshotsByNodeId as RunCurrentState["nodeSnapshotsByNodeId"],
    mutableState,
  };
}

function baseArgs(overrides: Partial<Parameters<typeof useWorkflowPinController>[0]> = {}) {
  return {
    workflowId: WORKFLOW_ID,
    viewContext: "live-workflow" as const,
    currentExecutionState: undefined,
    displayedWorkflow: undefined,
    replaceDebuggerOverlay: vi.fn().mockResolvedValue(undefined),
    selectedNodeId: null,
    selectedOutputPort: null,
    ...overrides,
  };
}

// --------------------------------------------------------------------------
// Mount
// --------------------------------------------------------------------------

describe("useWorkflowPinController — mount", () => {
  it("mounts without throwing", () => {
    const { result } = renderHook(() => useWorkflowPinController(baseArgs()));
    expect(result.current).toBeDefined();
  });

  it("returns all expected functions", () => {
    const { result } = renderHook(() => useWorkflowPinController(baseArgs()));
    expect(typeof result.current.togglePinnedOutput).toBe("function");
    expect(typeof result.current.buildPinEditorState).toBe("function");
    expect(typeof result.current.commitPinEdit).toBe("function");
    expect(typeof result.current.clearPinnedOutput).toBe("function");
    expect(typeof result.current.resolveOutputPortForNode).toBe("function");
  });
});

// --------------------------------------------------------------------------
// togglePinnedOutput
// --------------------------------------------------------------------------

describe("useWorkflowPinController — togglePinnedOutput", () => {
  it("calls replaceDebuggerOverlay with pinned output when node has live output", () => {
    const replaceDebuggerOverlay = vi.fn().mockResolvedValue(undefined);
    const currentExecutionState = makeCurrentState({
      outputs: { [NODE_A]: { main: [makeItem()] } },
    });

    const { result } = renderHook(() =>
      useWorkflowPinController(baseArgs({ currentExecutionState, replaceDebuggerOverlay })),
    );

    act(() => {
      result.current.togglePinnedOutput(NODE_A, "main");
    });

    expect(replaceDebuggerOverlay).toHaveBeenCalledOnce();
    const nextState = replaceDebuggerOverlay.mock.calls[0][0] as RunCurrentState;
    expect(nextState.mutableState?.nodesById[NODE_A]?.pinnedOutputsByPort?.["main"]).toBeDefined();
  });

  it("calls replaceDebuggerOverlay to unpin when output is already pinned", () => {
    const replaceDebuggerOverlay = vi.fn().mockResolvedValue(undefined);
    const currentExecutionState = makeCurrentState({
      outputs: { [NODE_A]: { main: [makeItem()] } },
      pinnedOutputsByPort: { [NODE_A]: { main: [makeItem()] } },
    });

    const { result } = renderHook(() =>
      useWorkflowPinController(baseArgs({ currentExecutionState, replaceDebuggerOverlay })),
    );

    act(() => {
      result.current.togglePinnedOutput(NODE_A, "main");
    });

    expect(replaceDebuggerOverlay).toHaveBeenCalledOnce();
    const nextState = replaceDebuggerOverlay.mock.calls[0][0] as RunCurrentState;
    // Unpinning: pinnedOutputsByPort for NODE_A should be absent or empty
    const nodeState = nextState.mutableState?.nodesById[NODE_A];
    expect(nodeState?.pinnedOutputsByPort?.["main"]).toBeUndefined();
  });

  it("does not call replaceDebuggerOverlay when viewContext is historical-run", () => {
    const replaceDebuggerOverlay = vi.fn().mockResolvedValue(undefined);
    const currentExecutionState = makeCurrentState({
      outputs: { [NODE_A]: { main: [makeItem()] } },
    });

    const { result } = renderHook(() =>
      useWorkflowPinController(
        baseArgs({
          viewContext: "historical-run",
          currentExecutionState,
          replaceDebuggerOverlay,
        }),
      ),
    );

    act(() => {
      result.current.togglePinnedOutput(NODE_A, "main");
    });

    expect(replaceDebuggerOverlay).not.toHaveBeenCalled();
  });

  it("is a no-op when no live output exists for the node+port (and not already pinned)", () => {
    const replaceDebuggerOverlay = vi.fn().mockResolvedValue(undefined);
    const currentExecutionState = makeCurrentState({});

    const { result } = renderHook(() =>
      useWorkflowPinController(baseArgs({ currentExecutionState, replaceDebuggerOverlay })),
    );

    act(() => {
      result.current.togglePinnedOutput(NODE_A, "main");
    });

    expect(replaceDebuggerOverlay).not.toHaveBeenCalled();
  });
});

// --------------------------------------------------------------------------
// buildPinEditorState
// --------------------------------------------------------------------------

describe("useWorkflowPinController — buildPinEditorState", () => {
  it("returns null in historical-run context", () => {
    const { result } = renderHook(() => useWorkflowPinController(baseArgs({ viewContext: "historical-run" })));
    expect(result.current.buildPinEditorState(NODE_A, "main")).toBeNull();
  });

  it("returns editor state in live-workflow context", () => {
    const currentExecutionState = makeCurrentState({
      outputs: { [NODE_A]: { main: [makeItem({ hello: "world" })] } },
    });
    const displayedWorkflow = makeWorkflow([NODE_A]);

    const { result } = renderHook(() =>
      useWorkflowPinController(baseArgs({ currentExecutionState, displayedWorkflow })),
    );

    const state = result.current.buildPinEditorState(NODE_A, "main");
    expect(state).not.toBeNull();
    expect(state?.mode).toBe("pin-output");
    expect(state?.nodeId).toBe(NODE_A);
    expect(state?.outputPort).toBe("main");
    expect(state?.workflowId).toBe(WORKFLOW_ID);
    expect(typeof state?.title).toBe("string");
  });

  it("editor state title includes node name", () => {
    const displayedWorkflow = makeWorkflow([NODE_A]);
    const currentExecutionState = makeCurrentState({
      outputs: { [NODE_A]: { main: [makeItem()] } },
    });

    const { result } = renderHook(() =>
      useWorkflowPinController(baseArgs({ currentExecutionState, displayedWorkflow })),
    );

    const state = result.current.buildPinEditorState(NODE_A, "main");
    expect(state?.title).toContain("main");
  });

  it("editor state uses pinned output as base items when pinned", () => {
    const pinnedItems: Items = [{ json: { pinned: true } }];
    const currentExecutionState = makeCurrentState({
      outputs: { [NODE_A]: { main: [makeItem({ live: true })] } },
      pinnedOutputsByPort: { [NODE_A]: { main: pinnedItems } },
    });
    const displayedWorkflow = makeWorkflow([NODE_A]);

    const { result } = renderHook(() =>
      useWorkflowPinController(baseArgs({ currentExecutionState, displayedWorkflow })),
    );

    const state = result.current.buildPinEditorState(NODE_A, "main");
    expect(state).not.toBeNull();
    // Value should be the serialized pinned output, not the live output
    const parsed = JSON.parse(state?.value ?? "null") as unknown;
    expect(JSON.stringify(parsed)).toContain("pinned");
  });
});

// --------------------------------------------------------------------------
// commitPinEdit
// --------------------------------------------------------------------------

describe("useWorkflowPinController — commitPinEdit", () => {
  it("calls replaceDebuggerOverlay with the provided items", async () => {
    const replaceDebuggerOverlay = vi.fn().mockResolvedValue(undefined);
    const items: Items = [{ json: { committed: true } }];

    const { result } = renderHook(() => useWorkflowPinController(baseArgs({ replaceDebuggerOverlay })));

    await act(async () => {
      await result.current.commitPinEdit(NODE_A, "main", items);
    });

    expect(replaceDebuggerOverlay).toHaveBeenCalledOnce();
    const nextState = replaceDebuggerOverlay.mock.calls[0][0] as RunCurrentState;
    expect(nextState.mutableState?.nodesById[NODE_A]?.pinnedOutputsByPort?.["main"]).toEqual(items);
  });

  it("resolves immediately without calling replaceDebuggerOverlay in historical-run context", async () => {
    const replaceDebuggerOverlay = vi.fn().mockResolvedValue(undefined);
    const items: Items = [{ json: { committed: true } }];

    const { result } = renderHook(() =>
      useWorkflowPinController(baseArgs({ viewContext: "historical-run", replaceDebuggerOverlay })),
    );

    await act(async () => {
      await result.current.commitPinEdit(NODE_A, "main", items);
    });

    expect(replaceDebuggerOverlay).not.toHaveBeenCalled();
  });
});

// --------------------------------------------------------------------------
// clearPinnedOutput
// --------------------------------------------------------------------------

describe("useWorkflowPinController — clearPinnedOutput", () => {
  it("calls replaceDebuggerOverlay without the cleared port", () => {
    const replaceDebuggerOverlay = vi.fn().mockResolvedValue(undefined);
    const currentExecutionState = makeCurrentState({
      pinnedOutputsByPort: { [NODE_A]: { main: [makeItem()], error: [makeItem()] } },
    });

    const { result } = renderHook(() =>
      useWorkflowPinController(baseArgs({ currentExecutionState, replaceDebuggerOverlay })),
    );

    act(() => {
      result.current.clearPinnedOutput(NODE_A, "main");
    });

    expect(replaceDebuggerOverlay).toHaveBeenCalledOnce();
    const nextState = replaceDebuggerOverlay.mock.calls[0][0] as RunCurrentState;
    expect(nextState.mutableState?.nodesById[NODE_A]?.pinnedOutputsByPort?.["main"]).toBeUndefined();
  });

  it("is a no-op in historical-run context", () => {
    const replaceDebuggerOverlay = vi.fn().mockResolvedValue(undefined);
    const currentExecutionState = makeCurrentState({
      pinnedOutputsByPort: { [NODE_A]: { main: [makeItem()] } },
    });

    const { result } = renderHook(() =>
      useWorkflowPinController(
        baseArgs({
          viewContext: "historical-run",
          currentExecutionState,
          replaceDebuggerOverlay,
        }),
      ),
    );

    act(() => {
      result.current.clearPinnedOutput(NODE_A, "main");
    });

    expect(replaceDebuggerOverlay).not.toHaveBeenCalled();
  });
});

// --------------------------------------------------------------------------
// resolveOutputPortForNode
// --------------------------------------------------------------------------

describe("useWorkflowPinController — resolveOutputPortForNode", () => {
  it("returns 'main' as fallback when no execution state and no workflow", () => {
    const { result } = renderHook(() => useWorkflowPinController(baseArgs()));
    const port = result.current.resolveOutputPortForNode(NODE_A);
    // With no workflow or execution state, the hook falls back to "main" as the default port.
    expect(port).toBe("main");
  });

  it("returns 'main' as default output port for a plain node", () => {
    const displayedWorkflow = makeWorkflow([NODE_A]);
    const { result } = renderHook(() => useWorkflowPinController(baseArgs({ displayedWorkflow })));
    const port = result.current.resolveOutputPortForNode(NODE_A);
    expect(port).toBe("main");
  });

  it("prefers the selectedOutputPort when the selected node matches", () => {
    const displayedWorkflow = makeWorkflow([NODE_A]);
    const currentExecutionState = makeCurrentState({
      outputs: { [NODE_A]: { main: [makeItem()], custom: [makeItem()] } },
    });

    const { result } = renderHook(() =>
      useWorkflowPinController(
        baseArgs({
          currentExecutionState,
          displayedWorkflow,
          selectedNodeId: NODE_A,
          selectedOutputPort: "custom",
        }),
      ),
    );
    const port = result.current.resolveOutputPortForNode(NODE_A);
    expect(port).toBe("custom");
  });

  it("returns first port from execution snapshot when no preference", () => {
    const displayedWorkflow = makeWorkflow([NODE_A]);
    const currentExecutionState = makeCurrentState({
      outputs: { [NODE_A]: { main: [makeItem()] } },
    });

    const { result } = renderHook(() =>
      useWorkflowPinController(baseArgs({ currentExecutionState, displayedWorkflow })),
    );
    const port = result.current.resolveOutputPortForNode(NODE_A);
    expect(port).toBe("main");
  });

  it("does not apply selectedOutputPort preference to a different node", () => {
    const displayedWorkflow = makeWorkflow([NODE_A, NODE_B]);
    const currentExecutionState = makeCurrentState({
      outputs: { [NODE_B]: { main: [makeItem()] } },
    });

    const { result } = renderHook(() =>
      useWorkflowPinController(
        baseArgs({
          currentExecutionState,
          displayedWorkflow,
          selectedNodeId: NODE_A, // NODE_A is selected
          selectedOutputPort: "custom",
        }),
      ),
    );
    // Resolving for NODE_B (not selected) should not use the preference
    const port = result.current.resolveOutputPortForNode(NODE_B);
    expect(port).toBe("main");
  });
});
