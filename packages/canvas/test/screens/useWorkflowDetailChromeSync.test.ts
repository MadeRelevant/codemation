// @vitest-environment jsdom

/**
 * Unit tests for useWorkflowDetailChromeSync hook.
 * Tests: callback fires on mount, re-fires on chromeStateKey change, fires null on unmount,
 * and is a no-op when onChromeChange is undefined.
 */

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useWorkflowDetailChromeSync } from "../../src/screens/useWorkflowDetailChromeSync";
import type { WorkflowDetailControllerResult } from "@codemation/canvas-core";
import type { WorkflowDetailChromeState } from "@codemation/canvas-core";

function makeController(overrides: Partial<WorkflowDetailControllerResult> = {}): WorkflowDetailControllerResult {
  return {
    isLiveWorkflowView: false,
    workflowIsActive: false,
    isWorkflowActivationPending: false,
    workflowActivationAlertLines: null,
    credentialAttentionSummaryLines: [],
    setWorkflowActive: () => {},
    dismissWorkflowActivationAlert: () => {},
    // Minimal fields for the hook — remaining fields are unused
    displayedWorkflow: undefined,
    displayedNodeSnapshotsByNodeId: {},
    displayedConnectionInvocations: [],
    pinnedNodeIds: new Set(),
    isRunsPaneVisible: false,
    isRunning: false,
    workflowDevBuildState: "idle",
    showRealtimeDisconnectedBadge: false,
    canCopySelectedRunToLive: false,
    credentialAttentionNodeIds: new Set(),
    credentialAttentionTooltipByNodeId: new Map(),
    workflowNodeIdsWithBoundCredential: new Set(),
    selectedRun: undefined,
    propertiesPanelTelemetryRunId: null,
    propertiesPanelTelemetryRunStatus: undefined,
    focusedInvocationIdInPropertiesPanel: null,
    selectInvocationInPropertiesPanel: () => {},
    sidebarModel: {
      workflowId: "wf-1",
      displayedWorkflow: undefined,
      workflow: undefined,
      workflowError: null,
      error: null,
      displayedRuns: undefined,
      runsError: null,
      selectedRunId: null,
      selectedRun: undefined,
    },
    sidebarFormatting: {
      formatDateTime: () => "",
      formatRunListWhen: () => "",
      formatRunListDurationLine: () => "",
      getExecutionModeLabel: () => null,
    },
    sidebarActions: { onSelectRun: () => {} },
    inspectorModel: {
      workflowId: "wf-1",
      viewContext: "live-workflow",
      selectedRunId: null,
      isLoading: false,
      loadError: null,
      selectedRun: undefined,
      selectedRunDetail: undefined,
      selectedNodeId: null,
      selectedExecutionInstanceId: null,
      selectedNodeSnapshot: undefined,
      selectedWorkflowNode: undefined,
      selectedPinnedOutput: undefined,
      selectedNodeError: undefined,
      selectedMode: "output",
      inputPane: {
        tab: "input",
        format: "json",
        selectedPort: null,
        portEntries: [],
        value: undefined,
        attachments: [],
        emptyLabel: "",
        showsError: false,
      },
      outputPane: {
        tab: "output",
        format: "json",
        selectedPort: null,
        portEntries: [],
        value: undefined,
        attachments: [],
        emptyLabel: "",
        showsError: false,
      },
      executionTreeData: [],
      executionTreeExpandedKeys: [],
      selectedExecutionTreeKey: null,
      nodeActions: {
        viewContext: "live-workflow",
        isRunning: false,
        canEditOutput: false,
        canClearPinnedOutput: false,
      },
    },
    inspectorFormatting: {
      formatDateTime: () => "",
      formatDurationLabel: () => null,
      getNodeDisplayName: () => "",
      getSnapshotTimestamp: () => undefined,
      getErrorHeadline: () => "",
      getErrorStack: () => null,
      getErrorClipboardText: () => "",
    },
    inspectorActions: {
      onSelectNode: () => {},
      onEditSelectedOutput: () => {},
      onClearPinnedOutput: () => {},
      onSelectMode: () => {},
      onSelectFormat: () => {},
      onSelectInputPort: () => {},
      onSelectOutputPort: () => {},
    },
    selectedNodeId: null,
    selectedCanvasNodeId: null,
    propertiesPanelNodeId: null,
    isPropertiesPanelOpen: false,
    selectedPropertiesWorkflowNode: undefined,
    selectCanvasNode: () => {},
    openPropertiesPanelForNode: () => {},
    requestOpenCredentialEditForNode: () => {},
    pendingCredentialEditForNodeId: null,
    consumePendingCredentialEditRequest: () => {},
    closePropertiesPanel: () => {},
    runCanvasNode: () => {},
    toggleCanvasNodePin: () => {},
    editCanvasNodeOutput: () => {},
    clearCanvasNodePin: () => {},
    runWorkflowFromCanvas: () => {},
    openLiveWorkflow: () => {},
    openExecutionsPane: () => {},
    copySelectedRunToLive: () => {},
    isPanelCollapsed: false,
    inspectorHeight: 320,
    startInspectorResize: () => {},
    toggleInspectorPanel: () => {},
    jsonEditorState: null,
    closeJsonEditor: () => {},
    saveJsonEditor: () => {},
    runErrorAlertLines: null,
    dismissRunErrorAlert: () => {},
    ...overrides,
  } as unknown as WorkflowDetailControllerResult;
}

describe("useWorkflowDetailChromeSync", () => {
  it("calls onChromeChange with current chrome state on mount", () => {
    const onChromeChange = vi.fn<[WorkflowDetailChromeState | null], void>();
    const controller = makeController({ isLiveWorkflowView: true, workflowIsActive: true });

    renderHook(() => useWorkflowDetailChromeSync(controller, onChromeChange));

    expect(onChromeChange).toHaveBeenCalledOnce();
    const arg = onChromeChange.mock.calls[0]![0] as WorkflowDetailChromeState;
    expect(arg.isLiveWorkflowView).toBe(true);
    expect(arg.workflowIsActive).toBe(true);
    expect(typeof arg.setWorkflowActive).toBe("function");
    expect(typeof arg.dismissWorkflowActivationAlert).toBe("function");
  });

  it("re-fires onChromeChange when controller chrome state key changes", () => {
    const onChromeChange = vi.fn<[WorkflowDetailChromeState | null], void>();
    let controller = makeController({ isLiveWorkflowView: false });

    const { rerender } = renderHook(
      ({ ctrl }: { ctrl: WorkflowDetailControllerResult }) => useWorkflowDetailChromeSync(ctrl, onChromeChange),
      { initialProps: { ctrl: controller } },
    );

    expect(onChromeChange).toHaveBeenCalledTimes(1);

    // Change a field that participates in chromeStateKey
    controller = makeController({ isLiveWorkflowView: true });
    rerender({ ctrl: controller });

    expect(onChromeChange).toHaveBeenCalledTimes(2);
    const arg = onChromeChange.mock.calls[1]![0] as WorkflowDetailChromeState;
    expect(arg.isLiveWorkflowView).toBe(true);
  });

  it("does NOT re-fire onChromeChange when chrome state key is unchanged", () => {
    const onChromeChange = vi.fn<[WorkflowDetailChromeState | null], void>();
    const controller = makeController({ isLiveWorkflowView: false });

    const { rerender } = renderHook(
      ({ ctrl }: { ctrl: WorkflowDetailControllerResult }) => useWorkflowDetailChromeSync(ctrl, onChromeChange),
      { initialProps: { ctrl: controller } },
    );

    expect(onChromeChange).toHaveBeenCalledTimes(1);
    // Rerender with same values (same chromeStateKey)
    rerender({ ctrl: makeController({ isLiveWorkflowView: false }) });
    expect(onChromeChange).toHaveBeenCalledTimes(1);
  });

  it("fires onChromeChange(null) on unmount", () => {
    const onChromeChange = vi.fn<[WorkflowDetailChromeState | null], void>();
    const controller = makeController();

    const { unmount } = renderHook(() => useWorkflowDetailChromeSync(controller, onChromeChange));
    onChromeChange.mockClear();

    unmount();
    expect(onChromeChange).toHaveBeenCalledOnce();
    expect(onChromeChange.mock.calls[0]![0]).toBeNull();
  });

  it("is a no-op when onChromeChange is undefined", () => {
    const controller = makeController();
    // Should not throw
    expect(() => {
      const { unmount } = renderHook(() => useWorkflowDetailChromeSync(controller, undefined));
      unmount();
    }).not.toThrow();
  });

  it("setWorkflowActive callback delegates to controller.setWorkflowActive", () => {
    const setWorkflowActive = vi.fn();
    const onChromeChange = vi.fn<[WorkflowDetailChromeState | null], void>();
    const controller = makeController({ setWorkflowActive });
    renderHook(() => useWorkflowDetailChromeSync(controller, onChromeChange));
    const arg = onChromeChange.mock.calls[0]![0] as WorkflowDetailChromeState;
    arg.setWorkflowActive(true);
    expect(setWorkflowActive).toHaveBeenCalledWith(true);
  });

  it("dismissWorkflowActivationAlert callback delegates to controller.dismissWorkflowActivationAlert", () => {
    const dismissWorkflowActivationAlert = vi.fn();
    const onChromeChange = vi.fn<[WorkflowDetailChromeState | null], void>();
    const controller = makeController({ dismissWorkflowActivationAlert });
    renderHook(() => useWorkflowDetailChromeSync(controller, onChromeChange));
    const arg = onChromeChange.mock.calls[0]![0] as WorkflowDetailChromeState;
    arg.dismissWorkflowActivationAlert();
    expect(dismissWorkflowActivationAlert).toHaveBeenCalled();
  });
});
