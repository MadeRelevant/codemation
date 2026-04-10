// @vitest-environment jsdom

import { ReactFlow, ReactFlowProvider, type Node as ReactFlowNode } from "@xyflow/react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { WorkflowCanvasNodeData } from "../../src/features/workflows/components/canvas/lib/workflowCanvasNodeData";
import { workflowCanvasNodeTypes } from "../../src/features/workflows/components/canvas/lib/workflowCanvasFlowTypes";

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe("workflow canvas error output handle", () => {
  const previousResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    // React Flow uses ResizeObserver; provide a minimal stub for jsdom.
    (globalThis as any).ResizeObserver = ResizeObserverStub;
  });

  afterEach(() => {
    (globalThis as any).ResizeObserver = previousResizeObserver;
  });

  it("renders distinct source handles and labels for declared output ports", () => {
    const node: ReactFlowNode<WorkflowCanvasNodeData> = {
      id: "node_1",
      type: "codemation",
      position: { x: 0, y: 0 },
      data: {
        nodeId: "node_1",
        label: "Test node",
        type: "TestNode",
        kind: "node",
        selected: false,
        propertiesTarget: false,
        isAttachment: false,
        isPinned: false,
        hasOutputData: false,
        isLiveWorkflowView: false,
        isRunning: false,
        sourceOutputPorts: ["main", "error"],
        sourceOutputPortCounts: { main: 1, error: 2 },
        targetInputPorts: ["in"],
        layoutWidthPx: 120,
        layoutHeightPx: 80,
        onSelectNode: () => {},
        onOpenPropertiesNode: () => {},
        onRunNode: () => {},
        onTogglePinnedOutput: () => {},
        onEditNodeOutput: () => {},
        onClearPinnedOutput: () => {},
      },
      draggable: false,
    };

    render(
      <div style={{ width: 600, height: 400 }}>
        <ReactFlowProvider>
          <ReactFlow nodes={[node]} edges={[]} nodeTypes={workflowCanvasNodeTypes} fitView={false} />
        </ReactFlowProvider>
      </div>,
    );

    expect(screen.getByTestId("canvas-handle-source-main")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-handle-source-error")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-output-port-label-main").textContent).toContain("main (1)");
    expect(screen.getByTestId("canvas-output-port-label-error").textContent).toContain("error (2)");
  });
});
