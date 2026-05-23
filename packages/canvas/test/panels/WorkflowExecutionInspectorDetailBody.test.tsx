// @vitest-environment jsdom

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkflowExecutionInspectorDetailBody } from "../../src/panels/WorkflowExecutionInspectorDetailBody";

const BASE_FORMATTING = {
  formatDateTime: () => "2024-01-01",
  formatDurationLabel: () => null,
  getErrorClipboardText: () => "",
  getErrorHeadline: () => "",
  getErrorStack: () => null,
  getNodeDisplayName: (_node: unknown, fallback: string | null) => fallback ?? "Node",
  getSnapshotTimestamp: () => undefined,
};

const EMPTY_PANE = (tab: "input" | "output") => ({
  tab,
  format: "json" as const,
  selectedPort: null,
  portEntries: [] as ReadonlyArray<[string, unknown[]]>,
  value: undefined,
  attachments: [] as readonly unknown[],
  emptyLabel: tab === "input" ? "No input" : "No output",
  showsError: false,
});

function makeModel(overrides = {}) {
  return {
    inputPane: EMPTY_PANE("input"),
    outputPane: EMPTY_PANE("output"),
    selectedMode: "output" as const,
    selectedNodeError: undefined,
    selectedNodeId: "node-1",
    nodeActions: {
      viewContext: "live-workflow" as const,
      isRunning: false,
      canEditOutput: false,
      canClearPinnedOutput: false,
    },
    selectedNodeSnapshot: undefined,
    selectedPinnedOutput: undefined,
    selectedWorkflowNode: undefined,
    viewContext: "live-workflow" as const,
    ...overrides,
  };
}

function makeActions(overrides = {}) {
  return {
    onClearPinnedOutput: vi.fn(),
    onEditSelectedOutput: vi.fn(),
    onSelectFormat: vi.fn(),
    onSelectInputPort: vi.fn(),
    onSelectMode: vi.fn(),
    onSelectOutputPort: vi.fn(),
    ...overrides,
  };
}

describe("WorkflowExecutionInspectorDetailBody", () => {
  it("renders the node name", () => {
    render(
      <WorkflowExecutionInspectorDetailBody model={makeModel()} formatting={BASE_FORMATTING} actions={makeActions()} />,
    );
    expect(screen.getByTestId("selected-node-name")).toBeInTheDocument();
  });

  it("renders input/output tab checkboxes", () => {
    render(
      <WorkflowExecutionInspectorDetailBody model={makeModel()} formatting={BASE_FORMATTING} actions={makeActions()} />,
    );
    expect(screen.getByTestId("inspector-tab-input")).toBeInTheDocument();
    expect(screen.getByTestId("inspector-tab-output")).toBeInTheDocument();
  });

  it("calls onSelectMode when input tab is clicked (input visible → switch to output)", () => {
    const onSelectMode = vi.fn();
    render(
      <WorkflowExecutionInspectorDetailBody
        model={makeModel({ selectedMode: "input" })}
        formatting={BASE_FORMATTING}
        actions={makeActions({ onSelectMode })}
      />,
    );
    // input is visible, clicking input tab should switch to output
    fireEvent.click(screen.getByTestId("inspector-tab-input"));
    expect(onSelectMode).toHaveBeenCalledWith("output");
  });

  it("calls onSelectMode when output tab is clicked (output visible → switch to input)", () => {
    const onSelectMode = vi.fn();
    render(
      <WorkflowExecutionInspectorDetailBody
        model={makeModel({ selectedMode: "output" })}
        formatting={BASE_FORMATTING}
        actions={makeActions({ onSelectMode })}
      />,
    );
    // output is visible, clicking output tab should switch to input
    fireEvent.click(screen.getByTestId("inspector-tab-output"));
    expect(onSelectMode).toHaveBeenCalledWith("input");
  });

  it("calls onSelectMode with split when input clicked while output visible (and input not visible)", () => {
    const onSelectMode = vi.fn();
    render(
      <WorkflowExecutionInspectorDetailBody
        model={makeModel({ selectedMode: "output" })}
        formatting={BASE_FORMATTING}
        actions={makeActions({ onSelectMode })}
      />,
    );
    // input tab is not visible (output mode) — clicking input tab should switch to split
    fireEvent.click(screen.getByTestId("inspector-tab-input"));
    expect(onSelectMode).toHaveBeenCalledWith("split");
  });

  it("renders Pinned badge when selectedPinnedOutput is set", () => {
    render(
      <WorkflowExecutionInspectorDetailBody
        model={makeModel({ selectedPinnedOutput: { items: [] } })}
        formatting={BASE_FORMATTING}
        actions={makeActions()}
      />,
    );
    expect(screen.getByTestId("selected-node-pinned-badge")).toBeInTheDocument();
  });

  it("renders subworkflow link when selectedWorkflowNode has referencedWorkflowId", () => {
    render(
      <WorkflowExecutionInspectorDetailBody
        model={makeModel({
          selectedWorkflowNode: { id: "n1", referencedWorkflowId: "wf-sub", type: "SubworkflowNode" },
        })}
        formatting={BASE_FORMATTING}
        actions={makeActions()}
      />,
    );
    expect(screen.getByTestId("execution-inspector-subworkflow-link")).toBeInTheDocument();
    // No childRunId — link goes to the editor
    expect(screen.getByTestId("execution-inspector-subworkflow-link").textContent).toContain("Open subworkflow editor");
  });

  it("shows 'Open subworkflow run' link text when snapshot has childRunId", () => {
    render(
      <WorkflowExecutionInspectorDetailBody
        model={makeModel({
          selectedWorkflowNode: { id: "n1", referencedWorkflowId: "wf-sub", type: "SubworkflowNode" },
          selectedNodeSnapshot: {
            nodeId: "n1",
            status: "completed" as const,
            childRunId: "run-child-1",
          },
        })}
        formatting={BASE_FORMATTING}
        actions={makeActions()}
      />,
    );
    expect(screen.getByTestId("execution-inspector-subworkflow-link").textContent).toContain("Open subworkflow run");
  });
});
