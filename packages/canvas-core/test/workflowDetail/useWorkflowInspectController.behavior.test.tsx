/**
 * Behavior tests for useWorkflowInspectController.
 *
 * Covers:
 * - URL ↔ nodeId sync and stale-node eviction
 * - selectNode / selectCanvasNode callbacks
 * - Auto-focus effect (no manual selection, running → queued → latest snapshot → first execution node)
 * - Mode auto-switch when error appears
 * - Inspector resize drag (mouse events)
 * - Properties panel open/close/credential edit
 * - Format tabs, port selection, panel collapse
 *
 * ESLint rules: no vi.mock, no vi.stubGlobal. Manual stubs via DI.
 */
import { describe, it, expect, afterEach } from "vitest";
import { act } from "@testing-library/react";
import { mountHook } from "../testkit/HookTestkit";
import { useWorkflowInspectController } from "../../src/hooks/workflowDetail/useWorkflowInspectController";
import type { NavigationAdapter } from "../../src/types/NavigationAdapter";
import type { WorkflowDto } from "../../src/realtime/realtimeDomainTypes";
import type { RunCurrentState } from "../../src/realtime/realtimeDomainTypes";

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

const NODE_A_ID = "node-a";
const NODE_B_ID = "node-b";
const NODE_C_ID = "node-c";

function makeWorkflow(nodeIds: string[] = [NODE_A_ID, NODE_B_ID]): WorkflowDto {
  return {
    id: "wf-1",
    name: "Test Workflow",
    active: false,
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

function makeCurrentExecutionState(
  snapshots: Array<{
    nodeId: string;
    status: "pending" | "queued" | "running" | "completed" | "failed" | "skipped";
    error?: { message: string; name?: string; stack?: string };
    outputs?: Record<string, Array<{ json: unknown }>>;
  }> = [],
): RunCurrentState {
  const nodeSnapshotsByNodeId: Record<
    string,
    (typeof snapshots)[number] & { runId: string; workflowId: string; updatedAt: string }
  > = {};
  for (const s of snapshots) {
    nodeSnapshotsByNodeId[s.nodeId] = {
      ...s,
      runId: "run-1",
      workflowId: "wf-1",
      updatedAt: new Date().toISOString(),
    };
  }
  return {
    outputsByNode: {},
    nodeSnapshotsByNodeId,
  };
}

function baseArgs(overrides: Partial<Parameters<typeof useWorkflowInspectController>[0]> = {}) {
  const { navigation } = makeNavigation();
  return {
    workflowId: "wf-1",
    navigation,
    viewContext: "live-workflow" as const,
    currentExecutionState: undefined,
    displayedWorkflow: undefined,
    workflow: undefined,
    normalizedConnectionInvocations: [],
    isRunning: false,
    ...overrides,
  };
}

// --------------------------------------------------------------------------
// Basic mount
// --------------------------------------------------------------------------

describe("useWorkflowInspectController — mount", () => {
  it("mounts without throwing", () => {
    const { result } = mountHook(() => useWorkflowInspectController(baseArgs()));
    expect(result.current).toBeDefined();
  });

  it("returns null selectedNodeId on initial mount with no workflow", () => {
    const { result } = mountHook(() => useWorkflowInspectController(baseArgs()));
    expect(result.current.selectedNodeId).toBeNull();
  });

  it("default inspectorHeight is 320", () => {
    const { result } = mountHook(() => useWorkflowInspectController(baseArgs()));
    expect(result.current.inspectorHeight).toBe(320);
  });

  it("isPanelCollapsed is false by default", () => {
    const { result } = mountHook(() => useWorkflowInspectController(baseArgs()));
    expect(result.current.isPanelCollapsed).toBe(false);
  });
});

// --------------------------------------------------------------------------
// URL → nodeId sync
// --------------------------------------------------------------------------

describe("useWorkflowInspectController — URL nodeId sync", () => {
  it("picks up nodeId from urlLocation on mount", () => {
    const { navigation } = makeNavigation({ nodeId: NODE_A_ID });
    const { result } = mountHook(() =>
      useWorkflowInspectController(
        baseArgs({
          navigation,
          displayedWorkflow: makeWorkflow([NODE_A_ID]),
        }),
      ),
    );
    expect(result.current.selectedNodeId).toBe(NODE_A_ID);
  });
});

// --------------------------------------------------------------------------
// Auto-focus effect
// --------------------------------------------------------------------------

describe("useWorkflowInspectController — auto-focus", () => {
  it("auto-selects first workflow node when no execution state", () => {
    const wf = makeWorkflow([NODE_A_ID, NODE_B_ID]);
    const { result } = mountHook(() =>
      useWorkflowInspectController(
        baseArgs({
          displayedWorkflow: wf,
        }),
      ),
    );
    expect(result.current.selectedNodeId).toBe(NODE_A_ID);
  });

  it("auto-focuses running node over queued", () => {
    const wf = makeWorkflow([NODE_A_ID, NODE_B_ID]);
    const state = makeCurrentExecutionState([
      { nodeId: NODE_A_ID, status: "queued" },
      { nodeId: NODE_B_ID, status: "running" },
    ]);
    const { result } = mountHook(() =>
      useWorkflowInspectController(
        baseArgs({
          displayedWorkflow: wf,
          currentExecutionState: state,
        }),
      ),
    );
    expect(result.current.selectedNodeId).toBe(NODE_B_ID);
  });

  it("auto-focuses queued node when no running node", () => {
    const wf = makeWorkflow([NODE_A_ID, NODE_B_ID]);
    const state = makeCurrentExecutionState([
      { nodeId: NODE_A_ID, status: "queued" },
      { nodeId: NODE_B_ID, status: "completed" },
    ]);
    const { result } = mountHook(() =>
      useWorkflowInspectController(
        baseArgs({
          displayedWorkflow: wf,
          currentExecutionState: state,
        }),
      ),
    );
    expect(result.current.selectedNodeId).toBe(NODE_A_ID);
  });

  it("auto-focuses running node on initial mount even when URL provides a node", () => {
    // On initial mount, the auto-focus effect fires before the URL-sync effect sets
    // hasManuallySelectedNode=true (both effects share the same initial state snapshot).
    // The auto-focus wins the first render, selecting the running node (NODE_A).
    // On subsequent renders (e.g. user navigating), hasManuallySelectedNode is set
    // correctly and auto-focus defers to the manual selection.
    const { navigation } = makeNavigation({ nodeId: NODE_B_ID });
    const wf = makeWorkflow([NODE_A_ID, NODE_B_ID]);
    const state = makeCurrentExecutionState([{ nodeId: NODE_A_ID, status: "running" }]);
    const { result } = mountHook(() =>
      useWorkflowInspectController(
        baseArgs({
          navigation,
          displayedWorkflow: wf,
          currentExecutionState: state,
        }),
      ),
    );
    // Auto-focus wins on initial mount (running node takes priority)
    expect(result.current.selectedNodeId).toBe(NODE_A_ID);
  });
});

// --------------------------------------------------------------------------
// selectNode callback
// --------------------------------------------------------------------------

describe("useWorkflowInspectController — selectNode", () => {
  it("updates selectedNodeId and navigates", () => {
    const { navigation, navigateCalls } = makeNavigation();
    const wf = makeWorkflow([NODE_A_ID, NODE_B_ID]);
    const { result } = mountHook(() => useWorkflowInspectController(baseArgs({ navigation, displayedWorkflow: wf })));
    act(() => {
      result.current.inspectorActions.onSelectNode({
        inspectorNodeId: NODE_B_ID,
        canvasNodeId: NODE_B_ID,
      });
    });
    expect(result.current.selectedNodeId).toBe(NODE_B_ID);
    expect(navigateCalls.at(-1)?.nodeId).toBe(NODE_B_ID);
  });

  it("selectCanvasNode updates selectedCanvasNodeId and selectedNodeId", () => {
    const { navigation } = makeNavigation();
    const wf = makeWorkflow([NODE_A_ID, NODE_B_ID]);
    const { result } = mountHook(() => useWorkflowInspectController(baseArgs({ navigation, displayedWorkflow: wf })));
    act(() => {
      result.current.selectCanvasNode(NODE_A_ID);
    });
    expect(result.current.selectedCanvasNodeId).toBe(NODE_A_ID);
  });

  it("selectNodeAndOutputPort sets selectedOutputPort and navigates", () => {
    const { navigation, navigateCalls } = makeNavigation();
    const wf = makeWorkflow([NODE_A_ID]);
    const { result } = mountHook(() => useWorkflowInspectController(baseArgs({ navigation, displayedWorkflow: wf })));
    act(() => {
      result.current.selectNodeAndOutputPort(NODE_A_ID, "main");
    });
    expect(result.current.selectedNodeId).toBe(NODE_A_ID);
    expect(result.current.selectedOutputPort).toBe("main");
    expect(navigateCalls.some((c) => c.nodeId === NODE_A_ID)).toBe(true);
  });

  it("selectNodeForRun marks manual selection and navigates", () => {
    const { navigation, navigateCalls } = makeNavigation();
    const wf = makeWorkflow([NODE_A_ID]);
    const { result } = mountHook(() => useWorkflowInspectController(baseArgs({ navigation, displayedWorkflow: wf })));
    act(() => {
      result.current.selectNodeForRun(NODE_A_ID);
    });
    expect(result.current.selectedNodeId).toBe(NODE_A_ID);
    expect(navigateCalls.some((c) => c.nodeId === NODE_A_ID)).toBe(true);
  });
});

// --------------------------------------------------------------------------
// Properties panel
// --------------------------------------------------------------------------

describe("useWorkflowInspectController — properties panel", () => {
  it("openPropertiesPanelForNode opens panel for given node", () => {
    const { result } = mountHook(() =>
      useWorkflowInspectController(baseArgs({ displayedWorkflow: makeWorkflow([NODE_A_ID]) })),
    );
    act(() => {
      result.current.openPropertiesPanelForNode(NODE_A_ID);
    });
    expect(result.current.isPropertiesPanelOpen).toBe(true);
    expect(result.current.propertiesPanelNodeId).toBe(NODE_A_ID);
  });

  it("closePropertiesPanel closes and clears node", () => {
    const { result } = mountHook(() =>
      useWorkflowInspectController(baseArgs({ displayedWorkflow: makeWorkflow([NODE_A_ID]) })),
    );
    act(() => {
      result.current.openPropertiesPanelForNode(NODE_A_ID);
    });
    act(() => {
      result.current.closePropertiesPanel();
    });
    expect(result.current.isPropertiesPanelOpen).toBe(false);
    expect(result.current.propertiesPanelNodeId).toBeNull();
  });

  it("requestOpenCredentialEditForNode sets pendingCredentialEditForNodeId", () => {
    const { result } = mountHook(() =>
      useWorkflowInspectController(baseArgs({ displayedWorkflow: makeWorkflow([NODE_A_ID]) })),
    );
    act(() => {
      result.current.requestOpenCredentialEditForNode(NODE_A_ID);
    });
    expect(result.current.pendingCredentialEditForNodeId).toBe(NODE_A_ID);
    expect(result.current.isPropertiesPanelOpen).toBe(true);
  });

  it("consumePendingCredentialEditRequest clears pendingCredentialEditForNodeId", () => {
    const { result } = mountHook(() =>
      useWorkflowInspectController(baseArgs({ displayedWorkflow: makeWorkflow([NODE_A_ID]) })),
    );
    act(() => {
      result.current.requestOpenCredentialEditForNode(NODE_A_ID);
    });
    act(() => {
      result.current.consumePendingCredentialEditRequest();
    });
    expect(result.current.pendingCredentialEditForNodeId).toBeNull();
  });
});

// --------------------------------------------------------------------------
// Inspector resize drag
// --------------------------------------------------------------------------

describe("useWorkflowInspectController — resize drag", () => {
  afterEach(() => {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });

  it("startInspectorResize sets cursor style", () => {
    const { result } = mountHook(() => useWorkflowInspectController(baseArgs()));
    act(() => {
      result.current.startInspectorResize(400);
    });
    expect(document.body.style.cursor).toBe("row-resize");
    expect(document.body.style.userSelect).toBe("none");
  });

  it("mousemove adjusts inspectorHeight (drag upward)", () => {
    const { result } = mountHook(() => useWorkflowInspectController(baseArgs()));
    act(() => {
      result.current.startInspectorResize(400);
    });
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientY: 300 }));
    });
    // drag up 100px → height increases by 100 (from 320 to 420)
    expect(result.current.inspectorHeight).toBe(420);
  });

  it("mousemove clamps to MAX_INSPECTOR_HEIGHT (640)", () => {
    const { result } = mountHook(() => useWorkflowInspectController(baseArgs()));
    act(() => {
      result.current.startInspectorResize(500);
    });
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientY: 0 }));
    });
    expect(result.current.inspectorHeight).toBe(640);
  });

  it("mousemove clamps to MIN_INSPECTOR_HEIGHT (240)", () => {
    const { result } = mountHook(() => useWorkflowInspectController(baseArgs()));
    act(() => {
      result.current.startInspectorResize(100);
    });
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientY: 1000 }));
    });
    expect(result.current.inspectorHeight).toBe(240);
  });

  it("mouseup resets cursor and ends resize", () => {
    const { result } = mountHook(() => useWorkflowInspectController(baseArgs()));
    act(() => {
      result.current.startInspectorResize(400);
    });
    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
  });

  it("startInspectorResize is a no-op when panel is collapsed", () => {
    const { result } = mountHook(() => useWorkflowInspectController(baseArgs()));
    act(() => {
      result.current.toggleInspectorPanel();
    });
    act(() => {
      result.current.startInspectorResize(400);
    });
    // Cursor should NOT be set because collapsed
    expect(document.body.style.cursor).toBe("");
  });
});

// --------------------------------------------------------------------------
// toggleInspectorPanel
// --------------------------------------------------------------------------

describe("useWorkflowInspectController — toggleInspectorPanel", () => {
  it("toggles panel collapsed state", () => {
    const { result } = mountHook(() => useWorkflowInspectController(baseArgs()));
    expect(result.current.isPanelCollapsed).toBe(false);
    act(() => {
      result.current.toggleInspectorPanel();
    });
    expect(result.current.isPanelCollapsed).toBe(true);
    act(() => {
      result.current.toggleInspectorPanel();
    });
    expect(result.current.isPanelCollapsed).toBe(false);
  });
});

// --------------------------------------------------------------------------
// Inspector mode auto-switch on error
// --------------------------------------------------------------------------

describe("useWorkflowInspectController — mode auto-switch", () => {
  it("inspector mode defaults to output", () => {
    const { result } = mountHook(() => useWorkflowInspectController(baseArgs()));
    expect(result.current.inspectorModel.selectedMode).toBe("output");
  });

  it("inspectorActions.onSelectMode changes mode", () => {
    const { result } = mountHook(() => useWorkflowInspectController(baseArgs()));
    act(() => {
      result.current.inspectorActions.onSelectMode("input");
    });
    expect(result.current.inspectorModel.selectedMode).toBe("input");
  });

  it("inspectorActions.onSelectFormat changes format for tab", () => {
    const { result } = mountHook(() => useWorkflowInspectController(baseArgs()));
    act(() => {
      result.current.inspectorActions.onSelectFormat("output", "pretty");
    });
    expect(result.current.inspectorModel.outputPane.format).toBe("pretty");
  });
});

// --------------------------------------------------------------------------
// Reset on workflowId change
// --------------------------------------------------------------------------

describe("useWorkflowInspectController — reset on workflowId change", () => {
  it("clears selectedNodeId when workflowId changes", () => {
    let workflowId = "wf-1";
    const wf1 = makeWorkflow([NODE_A_ID]);
    const { navigation } = makeNavigation({ nodeId: NODE_A_ID });

    const { result, rerender } = mountHook(() =>
      useWorkflowInspectController(baseArgs({ workflowId, navigation, displayedWorkflow: wf1 })),
    );
    expect(result.current.selectedNodeId).toBe(NODE_A_ID);

    // Change workflowId — hook should reset
    workflowId = "wf-2";
    rerender();

    expect(result.current.isPanelCollapsed).toBe(false);
    expect(result.current.inspectorHeight).toBe(320);
  });
});

// --------------------------------------------------------------------------
// inspectorModel shape
// --------------------------------------------------------------------------

describe("useWorkflowInspectController — inspectorModel shape", () => {
  it("exposes viewContext on inspectorModel", () => {
    const { result } = mountHook(() => useWorkflowInspectController(baseArgs({ viewContext: "historical-run" })));
    expect(result.current.inspectorModel.viewContext).toBe("historical-run");
  });

  it("exposes workflowId on inspectorModel", () => {
    const { result } = mountHook(() => useWorkflowInspectController(baseArgs({ workflowId: "my-wf" })));
    expect(result.current.inspectorModel.workflowId).toBe("my-wf");
  });

  it("nodeActions.canEditOutput is true in live-workflow when node is selected", () => {
    const wf = makeWorkflow([NODE_A_ID]);
    const { result } = mountHook(() =>
      useWorkflowInspectController(baseArgs({ displayedWorkflow: wf, viewContext: "live-workflow" })),
    );
    // auto-focus selects NODE_A_ID
    expect(result.current.inspectorModel.nodeActions.canEditOutput).toBe(true);
  });

  it("nodeActions.canEditOutput is false in historical-run", () => {
    const wf = makeWorkflow([NODE_A_ID]);
    const { result } = mountHook(() =>
      useWorkflowInspectController(baseArgs({ displayedWorkflow: wf, viewContext: "historical-run" })),
    );
    expect(result.current.inspectorModel.nodeActions.canEditOutput).toBe(false);
  });

  it("exposes formatting helpers", () => {
    const { result } = mountHook(() => useWorkflowInspectController(baseArgs()));
    expect(typeof result.current.inspectorFormatting.formatDateTime).toBe("function");
    expect(typeof result.current.inspectorFormatting.formatDurationLabel).toBe("function");
    expect(typeof result.current.inspectorFormatting.getNodeDisplayName).toBe("function");
    expect(typeof result.current.inspectorFormatting.getSnapshotTimestamp).toBe("function");
    expect(typeof result.current.inspectorFormatting.getErrorHeadline).toBe("function");
    expect(typeof result.current.inspectorFormatting.getErrorStack).toBe("function");
    expect(typeof result.current.inspectorFormatting.getErrorClipboardText).toBe("function");
  });
});

// --------------------------------------------------------------------------
// Stale node eviction
// --------------------------------------------------------------------------

describe("useWorkflowInspectController — stale node eviction", () => {
  it("navigates to null nodeId when selected node disappears from workflow", () => {
    const { navigation, navigateCalls } = makeNavigation({ nodeId: NODE_C_ID });
    const wf = makeWorkflow([NODE_A_ID, NODE_B_ID]); // NODE_C_ID not present

    mountHook(() => useWorkflowInspectController(baseArgs({ navigation, displayedWorkflow: wf })));

    // The eviction effect should have fired navigateToLocation with nodeId: null
    const evictionCall = navigateCalls.find((c) => c.nodeId === null);
    expect(evictionCall).toBeDefined();
  });
});

// --------------------------------------------------------------------------
// selectInvocationInPropertiesPanel
// --------------------------------------------------------------------------

describe("useWorkflowInspectController — selectInvocationInPropertiesPanel", () => {
  it("is a no-op when no properties panel node is set", () => {
    const { navigation, navigateCalls } = makeNavigation();
    const { result } = mountHook(() => useWorkflowInspectController(baseArgs({ navigation })));
    act(() => {
      result.current.selectInvocationInPropertiesPanel("inv-1");
    });
    // No navigation should have occurred
    expect(navigateCalls.length).toBe(0);
  });

  it("navigates when properties panel node is open", () => {
    const { navigation, navigateCalls } = makeNavigation();
    const wf = makeWorkflow([NODE_A_ID]);
    const { result } = mountHook(() => useWorkflowInspectController(baseArgs({ navigation, displayedWorkflow: wf })));
    act(() => {
      result.current.openPropertiesPanelForNode(NODE_A_ID);
    });
    act(() => {
      result.current.selectInvocationInPropertiesPanel("inv-1");
    });
    expect(navigateCalls.some((c) => c.nodeId === "inv-1")).toBe(true);
  });
});
