import { WorkflowCanvas } from "@codemation/next-host/src/features/workflows/components/canvas/WorkflowCanvas";
import type {
  NodeExecutionSnapshot,
  WorkflowDto,
} from "@codemation/next-host/src/features/workflows/hooks/realtime/realtime";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { WorkflowDetailFixtureFactory } from "../workflowDetail/testkit/WorkflowDetailFixtures";

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

  it("keeps data-carrying edges strong and fades empty edges", async () => {
    render(<WorkflowCanvasHarness initialPinned={false} />);

    const canvas = await screen.findByTestId("rf__wrapper");
    await waitFor(() => {
      expect(canvas.querySelector('marker[id*="#111827"]')).not.toBeNull();
      expect(canvas.querySelector('marker[id*="#9ca3af"]')).not.toBeNull();
    });
  });

  it("refreshes the canvas when the workflow structure changes without changing node or edge counts", async () => {
    render(<WorkflowCanvasStructureHarness />);

    const canvasRoot = await screen.findByTestId("workflow-canvas-root");
    const initialSignature = canvasRoot.getAttribute("data-workflow-structure-signature");

    fireEvent.click(screen.getByTestId("swap-workflow-structure-button"));

    await waitFor(() => {
      expect(canvasRoot.getAttribute("data-workflow-structure-signature")).not.toBe(initialSignature);
      expect(screen.getByTestId(`canvas-node-label-${WorkflowDetailFixtureFactory.nodeOneId}`)).toHaveTextContent(
        "Node 1 renamed",
      );
    });
  });
});

function WorkflowCanvasHarness(args: Readonly<{ initialPinned: boolean }>) {
  const workflow = WorkflowDetailFixtureFactory.createWorkflowDetail();
  const nodeId = WorkflowDetailFixtureFactory.agentNodeId;
  const [pinnedNodeIds, setPinnedNodeIds] = useState<ReadonlySet<string>>(() =>
    args.initialPinned ? new Set([nodeId]) : new Set<string>(),
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
        propertiesTargetNodeId={null}
        pinnedNodeIds={pinnedNodeIds}
        isLiveWorkflowView
        isRunning={false}
        onSelectNode={() => {}}
        onOpenPropertiesNode={() => {}}
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

function WorkflowCanvasStructureHarness() {
  const [workflow, setWorkflow] = useState(() => WorkflowDetailFixtureFactory.createWorkflowDetail());

  return (
    <div style={{ width: 1200, height: 640 }}>
      <button
        type="button"
        data-testid="swap-workflow-structure-button"
        onClick={() => {
          setWorkflow((current: WorkflowDto) => ({
            ...current,
            nodes: current.nodes.map((node: WorkflowDto["nodes"][number]) =>
              node.id === WorkflowDetailFixtureFactory.nodeOneId
                ? {
                    ...node,
                    name: "Node 1 renamed",
                  }
                : node,
            ),
          }));
        }}
      >
        Swap workflow structure
      </button>
      <WorkflowCanvas
        workflow={workflow}
        nodeSnapshotsByNodeId={{
          [WorkflowDetailFixtureFactory.agentNodeId]: WorkflowDetailFixtureFactory.createSnapshot(
            WorkflowDetailFixtureFactory.agentNodeId,
            "completed",
            2,
          ),
        }}
        selectedNodeId={WorkflowDetailFixtureFactory.nodeOneId}
        propertiesTargetNodeId={null}
        pinnedNodeIds={new Set<string>()}
        isLiveWorkflowView
        isRunning={false}
        onSelectNode={() => {}}
        onOpenPropertiesNode={() => {}}
        onRunNode={() => {}}
        onTogglePinnedOutput={() => {}}
        onEditNodeOutput={() => {}}
        onClearPinnedOutput={() => {}}
      />
    </div>
  );
}
