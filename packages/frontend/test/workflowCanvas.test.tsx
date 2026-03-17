import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { WorkflowCanvas } from "../src/ui/components/WorkflowCanvas";
import type { NodeExecutionSnapshot } from "../src/ui/realtime/realtime";
import { WorkflowDetailFixtureFactory } from "./workflowDetail/testkit/WorkflowDetailFixtures";

describe("workflow canvas toolbar", () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeAll(() => {
    if (typeof globalThis.ResizeObserver === "undefined") {
      class ResizeObserverMock {
        observe(): void {}
        disconnect(): void {}
        unobserve(): void {}
      }
      globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
    }
  });

  afterAll(() => {
    globalThis.ResizeObserver = originalResizeObserver;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows the node toolbar on hover and hides it shortly after leaving", async () => {
    render(<WorkflowCanvasHarness initialPinned={false} />);

    const nodeId = WorkflowDetailFixtureFactory.agentNodeId;
    const shell = await screen.findByTestId(`canvas-node-shell-${nodeId}`);
    const toolbar = screen.getByTestId(`canvas-node-toolbar-${nodeId}`);

    expect(toolbar).toHaveStyle({ opacity: "0", pointerEvents: "none" });

    fireEvent.pointerEnter(shell);

    await waitFor(() => {
      expect(toolbar).toHaveStyle({ opacity: "1", pointerEvents: "auto" });
    });

    fireEvent.pointerLeave(shell);

    expect(toolbar).toHaveStyle({ opacity: "1" });

    await waitFor(
      () => {
        expect(toolbar).toHaveStyle({ opacity: "0", pointerEvents: "none" });
      },
      { timeout: 500 },
    );
  });

  it("does not keep the toolbar stuck open after clicking unpin", async () => {
    render(<WorkflowCanvasHarness initialPinned />);

    const nodeId = WorkflowDetailFixtureFactory.agentNodeId;
    const shell = await screen.findByTestId(`canvas-node-shell-${nodeId}`);
    const toolbar = screen.getByTestId(`canvas-node-toolbar-${nodeId}`);

    fireEvent.pointerEnter(shell);

    const unpinButton = await screen.findByTestId(`canvas-node-unpin-button-${nodeId}`);
    fireEvent.focus(unpinButton);
    fireEvent.click(unpinButton);

    await waitFor(() => {
      expect(screen.getByTestId(`canvas-node-pin-button-${nodeId}`)).toBeInTheDocument();
    });

    fireEvent.pointerLeave(shell);

    await waitFor(
      () => {
        expect(toolbar).toHaveStyle({ opacity: "0", pointerEvents: "none" });
      },
      { timeout: 500 },
    );
  });

  it("uses the trailing status slot to show a pin for pinned nodes", async () => {
    render(<WorkflowCanvasHarness initialPinned />);

    const nodeId = WorkflowDetailFixtureFactory.agentNodeId;
    const trailingIcon = await screen.findByTestId(`canvas-node-trailing-icon-${nodeId}`);

    expect(trailingIcon).toHaveAttribute("data-icon-kind", "pin");
  });
});

function WorkflowCanvasHarness(args: Readonly<{ initialPinned: boolean }>) {
  const workflow = WorkflowDetailFixtureFactory.createWorkflowDetail();
  const nodeId = WorkflowDetailFixtureFactory.agentNodeId;
  const [pinnedNodeIds, setPinnedNodeIds] = useState<ReadonlySet<string>>(
    () => (args.initialPinned ? new Set([nodeId]) : new Set<string>()),
  );
  const nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>> = {
    [nodeId]: WorkflowDetailFixtureFactory.createSnapshot(nodeId, "completed", 2),
  };

  return (
    <div style={{ width: 1200, height: 640 }}>
      <WorkflowCanvas
        workflow={workflow}
        nodeSnapshotsByNodeId={nodeSnapshotsByNodeId}
        selectedNodeId={nodeId}
        pinnedNodeIds={pinnedNodeIds}
        isLiveWorkflowView
        isRunning={false}
        onSelectNode={() => {}}
        onRunNode={() => {}}
        onTogglePinnedOutput={() => {
          setPinnedNodeIds((current) => {
            if (current.has(nodeId)) {
              return new Set<string>();
            }
            return new Set([nodeId]);
          });
        }}
        onEditNodeOutput={() => {}}
        onClearPinnedOutput={() => {}}
      />
    </div>
  );
}
