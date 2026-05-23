// @vitest-environment jsdom

/**
 * Tests for WorkflowExecutionInspectorTreePanelContent.
 * The component uses @headless-tree/react which works in jsdom.
 * We build minimal WorkflowExecutionTreeDataLoaderModel fixtures.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkflowExecutionInspectorTreePanelContent } from "../../src/panels/WorkflowExecutionInspectorTreePanelContent";
import { WorkflowCanvasConfigProvider } from "@codemation/canvas-core";
import type { WorkflowExecutionTreeDataLoaderModel } from "@codemation/canvas";

const ROOT_ID = "__root__";

function makeMinimalTreeModel(nodeKeys: ReadonlyArray<string> = []): WorkflowExecutionTreeDataLoaderModel {
  const itemDataById = new Map<
    string,
    {
      key: string;
      childKeys: ReadonlyArray<string>;
      inspectorNodeId: string;
      canvasNodeId: string | null;
      workflowNode?: undefined;
      snapshot?: undefined;
    }
  >();
  const childIdsByParentId = new Map<string, ReadonlyArray<string>>();

  itemDataById.set(ROOT_ID, {
    key: ROOT_ID,
    childKeys: [...nodeKeys],
    inspectorNodeId: ROOT_ID,
    canvasNodeId: null,
  });
  childIdsByParentId.set(ROOT_ID, [...nodeKeys]);

  for (const key of nodeKeys) {
    itemDataById.set(key, {
      key,
      childKeys: [],
      inspectorNodeId: key,
      canvasNodeId: key,
      workflowNode: undefined,
      snapshot: undefined,
    });
    childIdsByParentId.set(key, []);
  }

  return {
    rootItemId: ROOT_ID,
    itemDataById: itemDataById as WorkflowExecutionTreeDataLoaderModel["itemDataById"],
    childIdsByParentId,
  };
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return <WorkflowCanvasConfigProvider value={undefined}>{children}</WorkflowCanvasConfigProvider>;
}

const BASE_FORMATTING = {
  formatDurationLabel: () => null,
  getNodeDisplayName: (_node: unknown, fallback: string | null) => fallback ?? "Node",
};

describe("WorkflowExecutionInspectorTreePanelContent", () => {
  it("renders the follow toggle button", () => {
    const treeModel = makeMinimalTreeModel([]);
    render(
      <Wrapper>
        <WorkflowExecutionInspectorTreePanelContent
          treeModel={treeModel}
          executionTreeExpandedKeys={[]}
          selectedExecutionTreeKey={null}
          viewContext="live-workflow"
          formatting={BASE_FORMATTING}
          onSelectNode={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.getByTestId("execution-tree-follow-toggle")).toBeInTheDocument();
  });

  it("renders the follow toggle button with either state text", () => {
    const treeModel = makeMinimalTreeModel([]);
    render(
      <Wrapper>
        <WorkflowExecutionInspectorTreePanelContent
          treeModel={treeModel}
          executionTreeExpandedKeys={[]}
          selectedExecutionTreeKey={null}
          viewContext="live-workflow"
          formatting={BASE_FORMATTING}
          onSelectNode={vi.fn()}
        />
      </Wrapper>,
    );
    const btn = screen.getByTestId("execution-tree-follow-toggle");
    // The button shows either "Follow active node" or "Following active node"
    expect(btn.textContent === "Follow active node" || btn.textContent === "Following active node").toBe(true);
  });

  it("toggles follow state when button is clicked twice", () => {
    const treeModel = makeMinimalTreeModel([]);
    render(
      <Wrapper>
        <WorkflowExecutionInspectorTreePanelContent
          treeModel={treeModel}
          executionTreeExpandedKeys={[]}
          selectedExecutionTreeKey={null}
          viewContext="live-workflow"
          formatting={BASE_FORMATTING}
          onSelectNode={vi.fn()}
        />
      </Wrapper>,
    );
    const toggleBtn = screen.getByTestId("execution-tree-follow-toggle");
    const initialText = toggleBtn.textContent;
    fireEvent.click(toggleBtn);
    // After one click the text should change
    const afterFirstClick = screen.getByTestId("execution-tree-follow-toggle").textContent;
    expect(afterFirstClick).not.toBe(initialText);
    // After second click it should go back
    fireEvent.click(screen.getByTestId("execution-tree-follow-toggle"));
    expect(screen.getByTestId("execution-tree-follow-toggle").textContent).toBe(initialText);
  });

  it("renders a tree node row for each item in the model", () => {
    const treeModel = makeMinimalTreeModel(["node-1", "node-2"]);
    render(
      <Wrapper>
        <WorkflowExecutionInspectorTreePanelContent
          treeModel={treeModel}
          executionTreeExpandedKeys={[]}
          selectedExecutionTreeKey={null}
          viewContext="live-workflow"
          formatting={BASE_FORMATTING}
          onSelectNode={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.getByTestId("execution-tree-node-node-1")).toBeInTheDocument();
    expect(screen.getByTestId("execution-tree-node-node-2")).toBeInTheDocument();
  });

  it("calls onSelectNode when a tree node row is clicked", () => {
    const onSelectNode = vi.fn();
    const treeModel = makeMinimalTreeModel(["node-a"]);
    render(
      <Wrapper>
        <WorkflowExecutionInspectorTreePanelContent
          treeModel={treeModel}
          executionTreeExpandedKeys={[]}
          selectedExecutionTreeKey={null}
          viewContext="live-workflow"
          formatting={BASE_FORMATTING}
          onSelectNode={onSelectNode}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId("execution-tree-node-node-a"));
    expect(onSelectNode).toHaveBeenCalledWith({
      inspectorNodeId: "node-a",
      canvasNodeId: "node-a",
    });
  });

  it("marks the selected node as selected when selectedExecutionTreeKey matches", () => {
    const treeModel = makeMinimalTreeModel(["node-sel"]);
    render(
      <Wrapper>
        <WorkflowExecutionInspectorTreePanelContent
          treeModel={treeModel}
          executionTreeExpandedKeys={[]}
          selectedExecutionTreeKey="node-sel"
          viewContext="historical-run"
          formatting={BASE_FORMATTING}
          onSelectNode={vi.fn()}
        />
      </Wrapper>,
    );
    const nodeEl = screen.getByTestId("execution-tree-node-node-sel");
    // Selected node gets bg-accent class
    expect(nodeEl.className).toContain("bg-accent");
  });

  it("renders tree with historical-run viewContext label", () => {
    const treeModel = makeMinimalTreeModel([]);
    render(
      <Wrapper>
        <WorkflowExecutionInspectorTreePanelContent
          treeModel={treeModel}
          executionTreeExpandedKeys={[]}
          selectedExecutionTreeKey={null}
          viewContext="historical-run"
          formatting={BASE_FORMATTING}
          onSelectNode={vi.fn()}
        />
      </Wrapper>,
    );
    // aria-label on the Tree changes based on viewContext
    const tree = document.querySelector('[role="tree"]') ?? document.querySelector(".codemation-execution-tree");
    expect(tree).not.toBeNull();
  });

  it("renders a node with a snapshot status when snapshot is present", () => {
    // Extend the minimal model with a snapshot for node-1
    const treeModel = makeMinimalTreeModel(["node-snap"]);
    // Mutate item data to add a snapshot
    const itemData = (
      treeModel.itemDataById as Map<
        string,
        {
          key: string;
          childKeys: ReadonlyArray<string>;
          inspectorNodeId: string;
          canvasNodeId: string | null;
          snapshot?: { status: string; nodeId: string };
          workflowNode?: undefined;
        }
      >
    ).get("node-snap")!;
    (treeModel.itemDataById as Map<string, typeof itemData>).set("node-snap", {
      ...itemData,
      snapshot: { status: "completed", nodeId: "node-snap" },
    });

    render(
      <Wrapper>
        <WorkflowExecutionInspectorTreePanelContent
          treeModel={treeModel}
          executionTreeExpandedKeys={[]}
          selectedExecutionTreeKey={null}
          viewContext="live-workflow"
          formatting={BASE_FORMATTING}
          onSelectNode={vi.fn()}
        />
      </Wrapper>,
    );
    const nodeEl = screen.getByTestId("execution-tree-node-node-snap");
    expect(nodeEl.getAttribute("data-codemation-status")).toBe("completed");
  });
});
