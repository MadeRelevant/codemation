// @vitest-environment jsdom

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkflowExecutionInspectorPanes } from "../../src/panels/WorkflowExecutionInspectorPanes";

const BASE_FORMATTING = {
  getErrorClipboardText: () => "",
  getErrorHeadline: () => "",
  getErrorStack: () => null,
};

const BASE_ACTIONS = {
  onClearPinnedOutput: vi.fn(),
  onEditSelectedOutput: vi.fn(),
  onSelectFormat: vi.fn(),
  onSelectInputPort: vi.fn(),
  onSelectOutputPort: vi.fn(),
};

const BASE_NODE_ACTIONS = {
  viewContext: "live-workflow" as const,
  isRunning: false,
  canEditOutput: false,
  canClearPinnedOutput: false,
};

function makePane(tab: "input" | "output", overrides = {}) {
  return {
    tab,
    format: "json" as const,
    selectedPort: null,
    portEntries: [] as ReadonlyArray<[string, unknown[]]>,
    value: undefined,
    attachments: [] as readonly unknown[],
    emptyLabel: `No ${tab}`,
    showsError: false,
    ...overrides,
  };
}

describe("WorkflowExecutionInspectorPanes", () => {
  it("renders a single pane", () => {
    render(
      <WorkflowExecutionInspectorPanes
        panes={[makePane("output")]}
        nodeActions={BASE_NODE_ACTIONS}
        selectedPinnedOutput={undefined}
        selectedNodeError={undefined}
        actions={BASE_ACTIONS}
        formatting={BASE_FORMATTING}
      />,
    );
    expect(screen.getByTestId("workflow-inspector-pane-output")).toBeInTheDocument();
  });

  it("renders two panes (split view)", () => {
    render(
      <WorkflowExecutionInspectorPanes
        panes={[makePane("input"), makePane("output")]}
        nodeActions={BASE_NODE_ACTIONS}
        selectedPinnedOutput={undefined}
        selectedNodeError={undefined}
        actions={BASE_ACTIONS}
        formatting={BASE_FORMATTING}
      />,
    );
    expect(screen.getByTestId("workflow-inspector-pane-input")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-inspector-pane-output")).toBeInTheDocument();
  });

  it("calls onSelectFormat when format button is clicked", () => {
    const onSelectFormat = vi.fn();
    render(
      <WorkflowExecutionInspectorPanes
        panes={[makePane("output")]}
        nodeActions={BASE_NODE_ACTIONS}
        selectedPinnedOutput={undefined}
        selectedNodeError={undefined}
        actions={{ ...BASE_ACTIONS, onSelectFormat }}
        formatting={BASE_FORMATTING}
      />,
    );
    // Format buttons: json and pretty always available
    const prettyBtn = screen.getByTestId("inspector-format-output-pretty");
    fireEvent.click(prettyBtn);
    expect(onSelectFormat).toHaveBeenCalledWith("output", "pretty");
  });

  it("calls onSelectInputPort when input port button is clicked", () => {
    const onSelectInputPort = vi.fn();
    const pane = makePane("input", {
      portEntries: [
        ["main", []],
        ["error", []],
      ],
    });
    render(
      <WorkflowExecutionInspectorPanes
        panes={[pane]}
        nodeActions={BASE_NODE_ACTIONS}
        selectedPinnedOutput={undefined}
        selectedNodeError={undefined}
        actions={{ ...BASE_ACTIONS, onSelectInputPort }}
        formatting={BASE_FORMATTING}
      />,
    );
    fireEvent.click(screen.getByTestId("inspector-port-input-error"));
    expect(onSelectInputPort).toHaveBeenCalledWith("error");
  });

  it("calls onSelectOutputPort when output port button is clicked", () => {
    const onSelectOutputPort = vi.fn();
    const pane = makePane("output", {
      portEntries: [
        ["main", []],
        ["error", []],
      ],
    });
    render(
      <WorkflowExecutionInspectorPanes
        panes={[pane]}
        nodeActions={BASE_NODE_ACTIONS}
        selectedPinnedOutput={undefined}
        selectedNodeError={undefined}
        actions={{ ...BASE_ACTIONS, onSelectOutputPort }}
        formatting={BASE_FORMATTING}
      />,
    );
    fireEvent.click(screen.getByTestId("inspector-port-output-error"));
    expect(onSelectOutputPort).toHaveBeenCalledWith("error");
  });
});
