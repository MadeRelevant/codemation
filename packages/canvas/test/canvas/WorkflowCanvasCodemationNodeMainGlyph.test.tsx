// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkflowCanvasCodemationNodeMainGlyph } from "../../src/canvas/WorkflowCanvasCodemationNodeMainGlyph";
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

describe("WorkflowCanvasCodemationNodeMainGlyph", () => {
  it("renders without crashing for a basic node", () => {
    const data = makeData({ nodeId: "n1", label: "HTTP", icon: "lucide:globe" });
    const { container } = render(
      <WorkflowCanvasCodemationNodeMainGlyph data={data} iconPx={24} isAgentInlineTitle={false} />,
    );
    expect(container.firstChild).not.toBeNull();
  });

  it("shows inline title when isAgentInlineTitle is true", () => {
    const data = makeData({ nodeId: "agent-1", label: "My Agent", role: "agent" });
    render(<WorkflowCanvasCodemationNodeMainGlyph data={data} iconPx={24} isAgentInlineTitle />);
    expect(screen.getByTestId("canvas-node-inline-title-agent-1")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-node-inline-title-agent-1").textContent).toBe("My Agent");
  });

  it("does not show inline title when isAgentInlineTitle is false", () => {
    const data = makeData({ nodeId: "n2", label: "Node" });
    render(<WorkflowCanvasCodemationNodeMainGlyph data={data} iconPx={24} isAgentInlineTitle={false} />);
    expect(screen.queryByTestId("canvas-node-inline-title-n2")).toBeNull();
  });
});
