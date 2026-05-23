// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkflowCanvasCodemationNodeLabelBelow } from "../../src/canvas/WorkflowCanvasCodemationNodeLabelBelow";
import type { WorkflowCanvasNodeData } from "@codemation/canvas-core";

const noop = () => {};

function makeData(overrides: Partial<WorkflowCanvasNodeData> = {}): WorkflowCanvasNodeData {
  return {
    nodeId: "node-1",
    label: "My Node",
    type: "httpRequest",
    kind: "action",
    role: undefined,
    icon: undefined,
    status: undefined,
    selected: false,
    propertiesTarget: false,
    isAttachment: false,
    isPinned: false,
    hasOutputData: false,
    isLiveWorkflowView: true,
    isRunning: false,
    sourceOutputPorts: ["main"],
    sourceOutputPortCounts: { main: 0 },
    targetInputPorts: ["in"],
    agentAttachments: { hasLanguageModel: false, hasTools: false },
    layoutWidthPx: 0,
    layoutHeightPx: 0,
    onSelectNode: noop,
    onOpenPropertiesNode: noop,
    onRunNode: noop,
    onTogglePinnedOutput: noop,
    onEditNodeOutput: noop,
    onClearPinnedOutput: noop,
    ...overrides,
  };
}

describe("WorkflowCanvasCodemationNodeLabelBelow", () => {
  it("renders the node label below a standard node", () => {
    const data = makeData({ label: "HTTP Request", nodeId: "http-1" });
    render(<WorkflowCanvasCodemationNodeLabelBelow data={data} maxWidthPx={120} />);
    expect(screen.getByTestId("canvas-node-label-http-1")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-node-label-http-1").textContent).toBe("HTTP Request");
  });

  it("returns null for a main agent node", () => {
    const data = makeData({ role: "agent", isAttachment: false });
    const { container } = render(<WorkflowCanvasCodemationNodeLabelBelow data={data} maxWidthPx={120} />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null for a nested agent node", () => {
    const data = makeData({ role: "nestedAgent" });
    const { container } = render(<WorkflowCanvasCodemationNodeLabelBelow data={data} maxWidthPx={120} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders for an attachment node (not nestedAgent)", () => {
    const data = makeData({ isAttachment: true, role: undefined, nodeId: "att-1", label: "Attachment" });
    render(<WorkflowCanvasCodemationNodeLabelBelow data={data} maxWidthPx={80} />);
    expect(screen.getByTestId("canvas-node-label-att-1")).toBeInTheDocument();
  });

  it("applies maxWidthPx to the container style", () => {
    const data = makeData({ nodeId: "node-max", label: "Test" });
    render(<WorkflowCanvasCodemationNodeLabelBelow data={data} maxWidthPx={200} />);
    const el = screen.getByTestId("canvas-node-label-node-max") as HTMLElement;
    expect(el.style.maxWidth).toBe("200px");
  });
});
