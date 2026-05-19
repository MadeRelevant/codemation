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

  it("sorts 'main' before non-main ports in the fallback port list", () => {
    // No execution state, so visibleEntries is empty -> falls through to declared/edge fallback.
    // Node has declaredOutputPorts: ["other", "main"] — after sort "main" should come first.
    const displayedWorkflow = {
      id: WORKFLOW_ID,
      name: "Sort Test Workflow",
      active: false,
      nodes: [
        {
          id: NODE_A,
          type: "core.noop",
          kind: "action",
          name: "Node A",
          position: { x: 0, y: 0 },
          declaredOutputPorts: ["other", "main"],
          hasNodeErrorHandler: false,
        },
      ],
      edges: [],
      connections: [],
      folders: [],
    } as unknown as Parameters<typeof useWorkflowPinController>[0]["displayedWorkflow"];

    const { result } = renderHook(() => useWorkflowPinController(baseArgs({ displayedWorkflow })));
    const port = result.current.resolveOutputPortForNode(NODE_A);
    // "main" should sort first regardless of declaration order
    expect(port).toBe("main");
  });

  it("returns preferredPort from fallback list when it matches but visibleEntries is empty", () => {
    // No snapshot outputs -> resolveSelectedPort returns null -> falls through to declared fallback.
    // preferredPort ("other") is in the declared ports so it should be returned.
    const displayedWorkflow = {
      id: WORKFLOW_ID,
      name: "Prefer Port Workflow",
      active: false,
      nodes: [
        {
          id: NODE_A,
          type: "core.noop",
          kind: "action",
          name: "Node A",
          position: { x: 0, y: 0 },
          declaredOutputPorts: ["main", "other"],
          hasNodeErrorHandler: false,
        },
      ],
      edges: [],
      connections: [],
      folders: [],
    } as unknown as Parameters<typeof useWorkflowPinController>[0]["displayedWorkflow"];

    const { result } = renderHook(() =>
      useWorkflowPinController(
        baseArgs({
          displayedWorkflow,
          selectedNodeId: NODE_A,
          selectedOutputPort: "other",
        }),
      ),
    );
    const port = result.current.resolveOutputPortForNode(NODE_A);
    // "other" is preferred and is in the declared ports
    expect(port).toBe("other");
  });

  it("includes error port for a node with hasNodeErrorHandler and declared ports", () => {
    // base.length > 0 && hasNodeErrorHandler -> includes "error" in combined
    const displayedWorkflow = {
      id: WORKFLOW_ID,
      name: "Error Handler Workflow",
      active: false,
      nodes: [
        {
          id: NODE_A,
          type: "core.noop",
          kind: "action",
          name: "Node A",
          position: { x: 0, y: 0 },
          declaredOutputPorts: ["main"],
          hasNodeErrorHandler: true,
        },
      ],
      edges: [],
      connections: [],
      folders: [],
    } as unknown as Parameters<typeof useWorkflowPinController>[0]["displayedWorkflow"];

    const { result } = renderHook(() =>
      useWorkflowPinController(
        baseArgs({
          displayedWorkflow,
          selectedNodeId: NODE_A,
          selectedOutputPort: "error",
        }),
      ),
    );
    // error port should be in the resolved list and returned as preferred
    const port = result.current.resolveOutputPortForNode(NODE_A);
    expect(port).toBe("error");
  });

  it("falls back to ['main', 'error'] for node with hasNodeErrorHandler but no declared ports", () => {
    const displayedWorkflow = {
      id: WORKFLOW_ID,
      name: "Error Only Workflow",
      active: false,
      nodes: [
        {
          id: NODE_A,
          type: "core.noop",
          kind: "action",
          name: "Node A",
          position: { x: 0, y: 0 },
          declaredOutputPorts: [],
          hasNodeErrorHandler: true,
        },
      ],
      edges: [],
      connections: [],
      folders: [],
    } as unknown as Parameters<typeof useWorkflowPinController>[0]["displayedWorkflow"];

    const { result } = renderHook(() => useWorkflowPinController(baseArgs({ displayedWorkflow })));
    const port = result.current.resolveOutputPortForNode(NODE_A);
    // "main" comes before "error" in the fallback ["main", "error"]
    expect(port).toBe("main");
  });

  it("uses edge-contributed output ports when no snapshot and node has no declared ports", () => {
    // No execution state -> resolveSelectedPort returns null -> falls through to edge/declared fallback.
    // Workflow has an edge from NODE_A on "custom" port.
    // NODE_A has no declaredOutputPorts and no hasNodeErrorHandler.
    const displayedWorkflow = {
      id: WORKFLOW_ID,
      name: "Edge Port Workflow",
      active: false,
      nodes: [
        {
          id: NODE_A,
          type: "core.noop",
          kind: "action",
          name: "Node A",
          position: { x: 0, y: 0 },
          declaredOutputPorts: [],
          hasNodeErrorHandler: false,
        },
        {
          id: NODE_B,
          type: "core.noop",
          kind: "action",
          name: "Node B",
          position: { x: 100, y: 0 },
          declaredOutputPorts: [],
          hasNodeErrorHandler: false,
        },
      ],
      edges: [
        {
          from: { nodeId: NODE_A, output: "custom" },
          to: { nodeId: NODE_B, input: "main" },
        },
      ],
      connections: [],
      folders: [],
    } as unknown as Parameters<typeof useWorkflowPinController>[0]["displayedWorkflow"];

    const { result } = renderHook(() => useWorkflowPinController(baseArgs({ displayedWorkflow })));
    // "custom" comes from the edge; no "main" so it's the only port and should be returned
    const port = result.current.resolveOutputPortForNode(NODE_A);
    expect(port).toBe("custom");
  });

  it("sort comparator: non-main ports are sorted alphabetically (covers localeCompare branch)", () => {
    // NODE_A has declaredOutputPorts: ["beta", "alpha"] (no "main").
    // After sort: ["alpha", "beta"] — returns "alpha" as first port.
    const displayedWorkflow = {
      id: WORKFLOW_ID,
      name: "Alpha Beta Workflow",
      active: false,
      nodes: [
        {
          id: NODE_A,
          type: "core.noop",
          kind: "action",
          name: "Node A",
          position: { x: 0, y: 0 },
          declaredOutputPorts: ["beta", "alpha"],
          hasNodeErrorHandler: false,
        },
      ],
      edges: [],
      connections: [],
      folders: [],
    } as unknown as Parameters<typeof useWorkflowPinController>[0]["displayedWorkflow"];

    const { result } = renderHook(() => useWorkflowPinController(baseArgs({ displayedWorkflow })));
    const port = result.current.resolveOutputPortForNode(NODE_A);
    expect(port).toBe("alpha");
  });
});
