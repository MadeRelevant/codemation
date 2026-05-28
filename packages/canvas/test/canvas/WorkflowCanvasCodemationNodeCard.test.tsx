// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkflowCanvasCodemationNodeCard } from "../../src/canvas/WorkflowCanvasCodemationNodeCard";
import type { WorkflowCanvasNodeData } from "@codemation/canvas-core";
import { WorkflowCanvasConfigProvider } from "@codemation/canvas-core";

const noop = () => {};

function makeData(overrides: Partial<WorkflowCanvasNodeData> = {}): WorkflowCanvasNodeData {
  return {
    nodeId: "node-1",
    label: "HTTP Request",
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

function Wrapper({ children }: { children: React.ReactNode }) {
  return <WorkflowCanvasConfigProvider value={undefined}>{children}</WorkflowCanvasConfigProvider>;
}

function renderCard(data: WorkflowCanvasNodeData, cardWidthPx = 80, cardHeightPx = 80) {
  return render(
    <Wrapper>
      <WorkflowCanvasCodemationNodeCard data={data} cardWidthPx={cardWidthPx} cardHeightPx={cardHeightPx} />
    </Wrapper>,
  );
}

describe("WorkflowCanvasCodemationNodeCard", () => {
  it("renders with node data-testid", () => {
    renderCard(makeData({ nodeId: "n1" }));
    expect(screen.getByTestId("canvas-node-card-n1")).toBeInTheDocument();
  });

  it("renders aria-label with node label and status", () => {
    renderCard(makeData({ nodeId: "n1", label: "My Node", status: "completed" }));
    const card = screen.getByTestId("canvas-node-card-n1");
    expect(card.getAttribute("aria-label")).toBe("My Node (completed)");
  });

  it("renders with pending status when status is undefined", () => {
    renderCard(makeData({ nodeId: "n2", label: "Node", status: undefined }));
    expect(screen.getByTestId("canvas-node-card-n2").getAttribute("data-codemation-node-status")).toBe("pending");
  });

  it("renders retry policy badge when retryPolicySummary is set", () => {
    renderCard(makeData({ nodeId: "n3", retryPolicySummary: "3 retries" }));
    expect(screen.getByTestId("canvas-node-policy-retry-icon-n3")).toBeInTheDocument();
  });

  it("does not render retry policy badge when retryPolicySummary is unset", () => {
    renderCard(makeData({ nodeId: "n4" }));
    expect(screen.queryByTestId("canvas-node-policy-retry-icon-n4")).toBeNull();
  });

  it("renders node error handler badge when hasNodeErrorHandler is true", () => {
    renderCard(makeData({ nodeId: "n5", hasNodeErrorHandler: true }));
    expect(screen.getByTestId("canvas-node-policy-error-handler-icon-n5")).toBeInTheDocument();
  });

  it("renders continue-when-empty badge when continueWhenEmptyOutput is true", () => {
    renderCard(makeData({ nodeId: "n6", continueWhenEmptyOutput: true }));
    expect(screen.getByTestId("canvas-node-continue-empty-icon-n6")).toBeInTheDocument();
  });

  it("renders credential attention badge when credentialAttentionTooltip is set", () => {
    renderCard(makeData({ nodeId: "n7", credentialAttentionTooltip: "No credential" }));
    expect(screen.getByTestId("canvas-node-credential-attention-icon-n7")).toBeInTheDocument();
  });

  it("renders trailing icon when status is completed (not pinned)", () => {
    renderCard(makeData({ nodeId: "n8", status: "completed", isPinned: false }));
    expect(screen.getByTestId("canvas-node-trailing-icon-n8")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-node-trailing-icon-n8").getAttribute("data-icon-kind")).toBe("completed");
  });

  it("renders pin trailing icon when isPinned is true", () => {
    renderCard(makeData({ nodeId: "n9", isPinned: true }));
    expect(screen.getByTestId("canvas-node-trailing-icon-n9").getAttribute("data-icon-kind")).toBe("pin");
  });

  it("sets data-codemation-node-pinned to 'true' when pinned", () => {
    renderCard(makeData({ nodeId: "n10", isPinned: true }));
    expect(screen.getByTestId("canvas-node-card-n10").getAttribute("data-codemation-node-pinned")).toBe("true");
  });

  it("sets propertiesTarget attribute correctly", () => {
    renderCard(makeData({ nodeId: "n11", propertiesTarget: true }));
    expect(screen.getByTestId("canvas-node-card-n11").getAttribute("data-codemation-properties-target")).toBe("true");
  });

  it("marks the card waiting-for-approval with a distinct attribute, aria label and hourglass trailing icon", () => {
    renderCard(makeData({ nodeId: "n12", status: "running", isWaitingForApproval: true }));
    const card = screen.getByTestId("canvas-node-card-n12");
    expect(card.getAttribute("data-codemation-node-waiting")).toBe("true");
    expect(card.getAttribute("aria-label")).toBe("HTTP Request (Waiting for approval)");
    expect(screen.getByTestId("canvas-node-trailing-icon-n12").getAttribute("data-icon-kind")).toBe(
      "waiting-for-approval",
    );
  });

  it("does not mark the card waiting when isWaitingForApproval is absent", () => {
    renderCard(makeData({ nodeId: "n13", status: "running" }));
    expect(screen.getByTestId("canvas-node-card-n13").getAttribute("data-codemation-node-waiting")).toBe("false");
  });
});
