// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkflowExecutionInspectorTreePanel } from "../../src/features/workflows/components/workflowDetail/WorkflowExecutionInspectorTreePanel";
import type {
  ExecutionTreeNode,
  WorkflowExecutionInspectorFormatting,
  WorkflowNode,
} from "../../src/features/workflows/lib/workflowDetail/workflowDetailTypes";

describe("WorkflowExecutionInspectorTreePanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the live workflow empty state when there are no nodes", () => {
    render(
      <WorkflowExecutionInspectorTreePanel
        model={{
          executionTreeData: [],
          executionTreeExpandedKeys: [],
          selectedExecutionTreeKey: null,
          viewContext: "live-workflow",
        }}
        formatting={WorkflowExecutionInspectorTreePanelFixture.createFormatting()}
        onSelectNode={vi.fn()}
      />,
    );

    expect(screen.getByTestId("workflow-execution-tree-panel")).toHaveTextContent("No workflow nodes available yet.");
  });

  it("renders top-level leaf nodes even when there are no branch keys", () => {
    render(
      <WorkflowExecutionInspectorTreePanel
        model={{
          executionTreeData: [
            {
              key: "terminal-sink",
              snapshot: WorkflowExecutionInspectorTreePanelFixture.createSnapshot("terminal-sink"),
              workflowNode: WorkflowExecutionInspectorTreePanelFixture.createNode("terminal-sink", "Terminal sink"),
              inspectorNodeId: "terminal-sink",
              canvasNodeId: "terminal-sink",
              children: [],
              isLeaf: true,
            },
          ],
          executionTreeExpandedKeys: [],
          selectedExecutionTreeKey: "terminal-sink",
          viewContext: "live-workflow",
        }}
        formatting={WorkflowExecutionInspectorTreePanelFixture.createFormatting()}
        onSelectNode={vi.fn()}
      />,
    );

    expect(screen.getByTestId("execution-tree-node-terminal-sink")).toBeInTheDocument();
  });

  it("collapses a branch and keeps descendants hidden across rerenders", () => {
    const view = render(
      <WorkflowExecutionInspectorTreePanel
        model={WorkflowExecutionInspectorTreePanelFixture.createModel()}
        formatting={WorkflowExecutionInspectorTreePanelFixture.createFormatting()}
        onSelectNode={vi.fn()}
      />,
    );

    expect(screen.getByTestId("execution-tree-node-agent-root")).toBeInTheDocument();
    expect(screen.getByTestId("execution-tree-node-specialist")).toBeInTheDocument();
    expect(screen.getByTestId("execution-tree-node-openai-call")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("execution-tree-toggle-agent-root"));

    expect(screen.queryByTestId("execution-tree-node-specialist")).not.toBeInTheDocument();
    expect(screen.queryByTestId("execution-tree-node-openai-call")).not.toBeInTheDocument();

    view.rerender(
      <WorkflowExecutionInspectorTreePanel
        model={WorkflowExecutionInspectorTreePanelFixture.createModel()}
        formatting={WorkflowExecutionInspectorTreePanelFixture.createFormatting()}
        onSelectNode={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("execution-tree-node-specialist")).not.toBeInTheDocument();
    expect(screen.queryByTestId("execution-tree-node-openai-call")).not.toBeInTheDocument();
  });

  it("selects the execution row and syncs the canvas node id from a nested execution row", () => {
    const onSelectNode = vi.fn();

    render(
      <WorkflowExecutionInspectorTreePanel
        model={WorkflowExecutionInspectorTreePanelFixture.createModel()}
        formatting={WorkflowExecutionInspectorTreePanelFixture.createFormatting()}
        onSelectNode={onSelectNode}
      />,
    );

    fireEvent.click(screen.getByTestId("execution-tree-node-openai-call"));

    expect(onSelectNode).toHaveBeenCalledTimes(1);
    expect(onSelectNode).toHaveBeenCalledWith({
      inspectorNodeId: "openai-call",
      canvasNodeId: "specialist",
    });
  });

  it("rerenders cleanly when live execution ids change", () => {
    const view = render(
      <WorkflowExecutionInspectorTreePanel
        model={{
          executionTreeData: [
            {
              key: "live-node-1",
              snapshot: WorkflowExecutionInspectorTreePanelFixture.createSnapshot("live-node-1"),
              workflowNode: WorkflowExecutionInspectorTreePanelFixture.createNode("live-node-1", "First live node"),
              inspectorNodeId: "live-node-1",
              canvasNodeId: "live-node-1",
              children: [],
              isLeaf: true,
            },
          ],
          executionTreeExpandedKeys: [],
          selectedExecutionTreeKey: "live-node-1",
          viewContext: "live-workflow",
        }}
        formatting={WorkflowExecutionInspectorTreePanelFixture.createFormatting()}
        onSelectNode={vi.fn()}
      />,
    );

    expect(screen.getByTestId("execution-tree-node-live-node-1")).toBeInTheDocument();

    view.rerender(
      <WorkflowExecutionInspectorTreePanel
        model={{
          executionTreeData: [
            {
              key: "live-node-2",
              snapshot: WorkflowExecutionInspectorTreePanelFixture.createSnapshot("live-node-2"),
              workflowNode: WorkflowExecutionInspectorTreePanelFixture.createNode("live-node-2", "Second live node"),
              inspectorNodeId: "live-node-2",
              canvasNodeId: "live-node-2",
              children: [],
              isLeaf: true,
            },
          ],
          executionTreeExpandedKeys: [],
          selectedExecutionTreeKey: "live-node-2",
          viewContext: "live-workflow",
        }}
        formatting={WorkflowExecutionInspectorTreePanelFixture.createFormatting()}
        onSelectNode={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("execution-tree-node-live-node-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("execution-tree-node-live-node-2")).toBeInTheDocument();
  });
});

class WorkflowExecutionInspectorTreePanelFixture {
  static createModel(): {
    executionTreeData: ReadonlyArray<ExecutionTreeNode>;
    executionTreeExpandedKeys: ReadonlyArray<string>;
    selectedExecutionTreeKey: string | null;
    viewContext: "live-workflow" | "historical-run";
  } {
    return {
      executionTreeData: [
        {
          key: "agent-root",
          snapshot: this.createSnapshot("agent-root"),
          workflowNode: this.createNode("agent-root", "Coordinator"),
          inspectorNodeId: "agent-root",
          canvasNodeId: "agent-root",
          children: [
            {
              key: "specialist",
              snapshot: this.createSnapshot("specialist"),
              workflowNode: this.createNode("specialist", "Specialist"),
              inspectorNodeId: "specialist",
              canvasNodeId: "specialist",
              children: [
                {
                  key: "openai-call",
                  snapshot: this.createSnapshot("openai-call"),
                  workflowNode: this.createNode("openai-call", "OpenAI"),
                  inspectorNodeId: "openai-call",
                  canvasNodeId: "specialist",
                  children: [],
                  isLeaf: true,
                },
              ],
              isLeaf: false,
            },
          ],
          isLeaf: false,
        },
      ],
      executionTreeExpandedKeys: ["agent-root", "specialist"],
      selectedExecutionTreeKey: "agent-root",
      viewContext: "historical-run",
    };
  }

  static createFormatting(): Pick<WorkflowExecutionInspectorFormatting, "formatDurationLabel" | "getNodeDisplayName"> {
    return {
      formatDurationLabel: (snapshot) => (snapshot?.startedAt && snapshot.finishedAt ? "Took 1s" : null),
      getNodeDisplayName: (node, fallback) => node?.name ?? fallback ?? "Unnamed node",
    };
  }

  static createNode(id: string, name: string): WorkflowNode {
    return {
      id,
      name,
      kind: "node",
      type: "Stub",
    } as WorkflowNode;
  }

  static createSnapshot(nodeId: string) {
    return {
      runId: "run-1",
      workflowId: "wf-1",
      nodeId,
      status: "completed",
      startedAt: "2026-03-15T09:50:59.000Z",
      finishedAt: "2026-03-15T09:51:00.000Z",
      updatedAt: "2026-03-15T09:51:00.000Z",
    };
  }
}
