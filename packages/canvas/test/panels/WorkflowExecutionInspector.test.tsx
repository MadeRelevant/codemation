// @vitest-environment jsdom

/**
 * Tests for WorkflowExecutionInspector:
 * - 4 early-return branches (loading+historical, loading+live, loadError, no selectedNodeId)
 * - full-render path
 * - drag-resize sidebar
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkflowExecutionInspector } from "../../src/panels/WorkflowExecutionInspector";
import type {
  WorkflowExecutionInspectorModel,
  WorkflowExecutionInspectorActions,
  WorkflowExecutionInspectorFormatting,
} from "@codemation/canvas";

function makeModel(overrides: Partial<WorkflowExecutionInspectorModel> = {}): WorkflowExecutionInspectorModel {
  return {
    workflowId: "wf-1",
    viewContext: "historical-run",
    selectedRunId: "run-1",
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
      emptyLabel: "No input",
      showsError: false,
    },
    outputPane: {
      tab: "output",
      format: "json",
      selectedPort: null,
      portEntries: [],
      value: undefined,
      attachments: [],
      emptyLabel: "No output",
      showsError: false,
    },
    executionTreeData: [],
    executionTreeExpandedKeys: [],
    selectedExecutionTreeKey: null,
    nodeActions: {
      viewContext: "historical-run",
      isRunning: false,
      canEditOutput: false,
      canClearPinnedOutput: false,
    },
    ...overrides,
  };
}

function makeActions(): WorkflowExecutionInspectorActions {
  return {
    onSelectNode: () => {},
    onEditSelectedOutput: () => {},
    onClearPinnedOutput: () => {},
    onSelectMode: () => {},
    onSelectFormat: () => {},
    onSelectInputPort: () => {},
    onSelectOutputPort: () => {},
  };
}

function makeFormatting(): WorkflowExecutionInspectorFormatting {
  return {
    formatDateTime: () => "",
    formatDurationLabel: () => null,
    getNodeDisplayName: (_node, fallback) => fallback ?? "",
    getSnapshotTimestamp: () => undefined,
    getErrorHeadline: () => "",
    getErrorStack: () => null,
    getErrorClipboardText: () => "",
  };
}

describe("WorkflowExecutionInspector — early-return branches", () => {
  it("renders loading message for historical-run context when no selectedRun", () => {
    const model = makeModel({
      isLoading: true,
      viewContext: "historical-run",
      selectedRun: undefined,
      selectedRunDetail: undefined,
    });
    const { container } = render(
      <WorkflowExecutionInspector model={model} actions={makeActions()} formatting={makeFormatting()} />,
    );
    expect(container.textContent).toContain("Loading execution details");
  });

  it("renders loading message for live-workflow context when no selectedWorkflowNode", () => {
    const model = makeModel({
      isLoading: true,
      viewContext: "live-workflow",
      selectedWorkflowNode: undefined,
    });
    const { container } = render(
      <WorkflowExecutionInspector model={model} actions={makeActions()} formatting={makeFormatting()} />,
    );
    expect(container.textContent).toContain("Loading live workflow state");
  });

  it("renders error message when loadError is set", () => {
    const model = makeModel({ loadError: "Failed to fetch run details", isLoading: false });
    const { container } = render(
      <WorkflowExecutionInspector model={model} actions={makeActions()} formatting={makeFormatting()} />,
    );
    expect(container.textContent).toContain("Failed to fetch run details");
  });

  it("renders 'Select a node' prompt when selectedNodeId is null and not loading", () => {
    const model = makeModel({ selectedNodeId: null, isLoading: false, loadError: null });
    const { container } = render(
      <WorkflowExecutionInspector model={model} actions={makeActions()} formatting={makeFormatting()} />,
    );
    expect(container.textContent).toContain("Select a node to inspect");
  });
});

describe("WorkflowExecutionInspector — full render", () => {
  it("renders the inspector grid when selectedNodeId is set", () => {
    const model = makeModel({ selectedNodeId: "node-1", isLoading: false, loadError: null });
    render(<WorkflowExecutionInspector model={model} actions={makeActions()} formatting={makeFormatting()} />);
    expect(screen.getByTestId("workflow-execution-inspector")).toBeInTheDocument();
  });

  it("does not show loading or error message in full-render path", () => {
    const model = makeModel({ selectedNodeId: "node-1", isLoading: false, loadError: null });
    const { container } = render(
      <WorkflowExecutionInspector model={model} actions={makeActions()} formatting={makeFormatting()} />,
    );
    expect(container.textContent).not.toContain("Loading");
    expect(container.textContent).not.toContain("Select a node");
  });
});

describe("WorkflowExecutionInspector — sidebar resize", () => {
  it("fires resize mousemove/mouseup to exercise the resize useEffect branches", () => {
    const model = makeModel({ selectedNodeId: "node-1", isLoading: false, loadError: null });
    render(<WorkflowExecutionInspector model={model} actions={makeActions()} formatting={makeFormatting()} />);
    const resizer = screen.getByTestId("workflow-execution-tree-resizer");
    // MouseDown triggers onResizeStart which sets isTreePanelResizing=true
    fireEvent.mouseDown(resizer, { clientX: 320 });
    // Now isTreePanelResizing=true → window listeners are active → fire mousemove + mouseup on window
    fireEvent.mouseMove(window, { clientX: 380 });
    fireEvent.mouseUp(window);
    // After mouseUp isTreePanelResizing=false; component should still be mounted
    expect(screen.getByTestId("workflow-execution-inspector")).toBeInTheDocument();
  });
});
