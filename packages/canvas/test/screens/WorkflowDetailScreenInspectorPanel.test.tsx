// @vitest-environment jsdom

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkflowDetailScreenInspectorPanel } from "../../src/screens/WorkflowDetailScreenInspectorPanel";

function makeController(
  overrides: Partial<{
    isPanelCollapsed: boolean;
    startInspectorResize: (y: number) => void;
    toggleInspectorPanel: () => void;
  }> = {},
) {
  return {
    isPanelCollapsed: false,
    startInspectorResize: vi.fn(),
    toggleInspectorPanel: vi.fn(),
    // Minimal inspectorModel / formatting / actions to satisfy WorkflowExecutionInspector
    inspectorModel: {
      selectedRunId: null,
      selectedNodeId: null,
      inspectorPanelHeightPx: 320,
      viewContext: "live-workflow" as const,
      executionTreeDataLoader: {
        rootItemId: "__root__",
        itemDataById: new Map(),
        childIdsByParentId: new Map(),
      },
      selectedNodeInspector: null,
    },
    inspectorFormatting: {
      formatDurationLabel: () => null,
      getNodeDisplayName: (_node: unknown) => "Node",
    },
    inspectorActions: {
      onSelectRun: vi.fn(),
      onSelectNode: vi.fn(),
    },
    ...overrides,
  };
}

describe("WorkflowDetailScreenInspectorPanel", () => {
  it("renders the resize handle", () => {
    render(<WorkflowDetailScreenInspectorPanel controller={makeController() as any} />);
    expect(screen.getByTestId("workflow-detail-inspector-resize-handle")).toBeInTheDocument();
  });

  it("renders 'Execution inspector' label", () => {
    render(<WorkflowDetailScreenInspectorPanel controller={makeController() as any} />);
    expect(screen.getByText("Execution inspector")).toBeInTheDocument();
  });

  it("shows collapse button when panel is open", () => {
    render(<WorkflowDetailScreenInspectorPanel controller={makeController({ isPanelCollapsed: false })} as any />);
    const btn = screen.getByRole("button", { name: /collapse execution inspector/i });
    expect(btn).toBeInTheDocument();
  });

  it("shows open button when panel is collapsed", () => {
    render(<WorkflowDetailScreenInspectorPanel controller={makeController({ isPanelCollapsed: true })} as any />);
    const btn = screen.getByRole("button", { name: /open execution inspector/i });
    expect(btn).toBeInTheDocument();
  });

  it("calls toggleInspectorPanel when toggle button is clicked", () => {
    const controller = makeController({ isPanelCollapsed: false });
    render(<WorkflowDetailScreenInspectorPanel controller={controller as any} />);
    const btn = screen.getByRole("button", { name: /collapse execution inspector/i });
    fireEvent.click(btn);
    expect(controller.toggleInspectorPanel).toHaveBeenCalled();
  });

  it("calls startInspectorResize on mousedown of resize handle", () => {
    const controller = makeController();
    render(<WorkflowDetailScreenInspectorPanel controller={controller as any} />);
    const handle = screen.getByTestId("workflow-detail-inspector-resize-handle");
    fireEvent.mouseDown(handle, { clientY: 200 });
    expect(controller.startInspectorResize).toHaveBeenCalledWith(200);
  });

  it("hides inspector content when panel is collapsed", () => {
    const controller = makeController({ isPanelCollapsed: true });
    const { container } = render(<WorkflowDetailScreenInspectorPanel controller={controller as any} />);
    // When collapsed, the inner WorkflowExecutionInspector div is not rendered
    const inner = container.querySelector(".min-h-0.min-w-0.overflow-hidden");
    expect(inner).toBeNull();
  });
});
