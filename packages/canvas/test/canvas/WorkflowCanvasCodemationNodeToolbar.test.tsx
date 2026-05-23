// @vitest-environment jsdom

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkflowCanvasCodemationNodeToolbar } from "../../src/canvas/WorkflowCanvasCodemationNodeToolbar";
import type { WorkflowCanvasNodeData } from "@codemation/canvas-core";

function makeData(overrides: Partial<WorkflowCanvasNodeData> = {}): WorkflowCanvasNodeData {
  return {
    nodeId: "n1",
    label: "My Node",
    type: "myType",
    kind: "node",
    selected: false,
    propertiesTarget: false,
    isAttachment: false,
    isPinned: false,
    hasOutputData: true,
    isLiveWorkflowView: true,
    isRunning: false,
    sourceOutputPorts: [],
    sourceOutputPortCounts: {},
    onSelectNode: vi.fn(),
    onRunNode: vi.fn(),
    onTogglePinnedOutput: vi.fn(),
    onEditNodeOutput: vi.fn(),
    ...overrides,
  } as unknown as WorkflowCanvasNodeData;
}

describe("WorkflowCanvasCodemationNodeToolbar", () => {
  it("renders the toolbar container", () => {
    const data = makeData();
    render(
      <WorkflowCanvasCodemationNodeToolbar
        data={data}
        isPinned={false}
        isToolbarVisible={true}
        setHasToolbarFocus={vi.fn()}
      />,
    );
    expect(screen.getByTestId("canvas-node-toolbar-n1")).toBeInTheDocument();
  });

  it("renders the run button", () => {
    const data = makeData();
    render(
      <WorkflowCanvasCodemationNodeToolbar
        data={data}
        isPinned={false}
        isToolbarVisible={true}
        setHasToolbarFocus={vi.fn()}
      />,
    );
    expect(screen.getByTestId("canvas-node-run-button-n1")).toBeInTheDocument();
  });

  it("shows pin button when not pinned", () => {
    const data = makeData({ hasOutputData: true });
    render(
      <WorkflowCanvasCodemationNodeToolbar
        data={data}
        isPinned={false}
        isToolbarVisible={true}
        setHasToolbarFocus={vi.fn()}
      />,
    );
    expect(screen.getByTestId("canvas-node-pin-button-n1")).toBeInTheDocument();
  });

  it("shows unpin button when pinned", () => {
    const data = makeData({ hasOutputData: true });
    render(
      <WorkflowCanvasCodemationNodeToolbar
        data={data}
        isPinned={true}
        isToolbarVisible={true}
        setHasToolbarFocus={vi.fn()}
      />,
    );
    expect(screen.getByTestId("canvas-node-unpin-button-n1")).toBeInTheDocument();
  });

  it("shows credential edit button when showCredentialEditToolbar is set", () => {
    const onOpenCredential = vi.fn();
    const data = makeData({ showCredentialEditToolbar: true, onOpenCredentialEditFromCanvas: onOpenCredential });
    render(
      <WorkflowCanvasCodemationNodeToolbar
        data={data}
        isPinned={false}
        isToolbarVisible={true}
        setHasToolbarFocus={vi.fn()}
      />,
    );
    expect(screen.getByTestId("canvas-node-credential-edit-button-n1")).toBeInTheDocument();
  });

  it("calls onRunNode when run button is clicked", () => {
    const onRunNode = vi.fn();
    const onSelectNode = vi.fn();
    const data = makeData({ onRunNode, onSelectNode });
    render(
      <WorkflowCanvasCodemationNodeToolbar
        data={data}
        isPinned={false}
        isToolbarVisible={true}
        setHasToolbarFocus={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("canvas-node-run-button-n1"));
    expect(onRunNode).toHaveBeenCalledWith("n1");
  });

  it("calls onEditNodeOutput when edit button is clicked", () => {
    const onEditNodeOutput = vi.fn();
    const onSelectNode = vi.fn();
    const data = makeData({ onEditNodeOutput, onSelectNode });
    render(
      <WorkflowCanvasCodemationNodeToolbar
        data={data}
        isPinned={false}
        isToolbarVisible={true}
        setHasToolbarFocus={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("canvas-node-edit-button-n1"));
    expect(onEditNodeOutput).toHaveBeenCalledWith("n1");
  });

  it("calls onOpenCredentialEditFromCanvas and onSelectNode when credential edit button is clicked", () => {
    const onOpenCredentialEditFromCanvas = vi.fn();
    const onSelectNode = vi.fn();
    const data = makeData({
      showCredentialEditToolbar: true,
      onOpenCredentialEditFromCanvas,
      onSelectNode,
    });
    render(
      <WorkflowCanvasCodemationNodeToolbar
        data={data}
        isPinned={false}
        isToolbarVisible={true}
        setHasToolbarFocus={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("canvas-node-credential-edit-button-n1"));
    expect(onOpenCredentialEditFromCanvas).toHaveBeenCalled();
    expect(onSelectNode).toHaveBeenCalledWith("n1");
  });

  it("calls onTogglePinnedOutput when pin/unpin button is clicked", () => {
    const onTogglePinnedOutput = vi.fn();
    const onSelectNode = vi.fn();
    const data = makeData({ onTogglePinnedOutput, onSelectNode, hasOutputData: true });
    render(
      <WorkflowCanvasCodemationNodeToolbar
        data={data}
        isPinned={false}
        isToolbarVisible={true}
        setHasToolbarFocus={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("canvas-node-pin-button-n1"));
    expect(onTogglePinnedOutput).toHaveBeenCalledWith("n1");
    expect(onSelectNode).toHaveBeenCalledWith("n1");
  });
});
