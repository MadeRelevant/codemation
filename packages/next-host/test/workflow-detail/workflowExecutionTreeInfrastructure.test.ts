import { describe, expect, it } from "vitest";

import { WorkflowExecutionTreeBuilder } from "../../src/features/workflows/lib/workflowDetail/WorkflowExecutionTreeBuilder";
import { WorkflowExecutionTreeDataLoaderAdapter } from "../../src/features/workflows/lib/workflowDetail/WorkflowExecutionTreeDataLoaderAdapter";
import type { ExecutionNode } from "../../src/features/workflows/lib/workflowDetail/workflowDetailTypes";

describe("WorkflowExecutionTreeBuilder", () => {
  it("falls back to a root node when the parent reference cannot be resolved", () => {
    const tree = WorkflowExecutionTreeBuilder.build([
      {
        node: {
          id: "orphan-node",
          kind: "node",
          type: "Tool",
          name: "Orphan",
          parentNodeId: "missing-parent",
        } as any,
        snapshot: {
          runId: "run-1",
          workflowId: "wf-1",
          nodeId: "orphan-node",
          status: "completed",
          updatedAt: "2026-01-01T00:00:00.000Z",
        } as any,
      } satisfies ExecutionNode,
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.key).toBe("orphan-node");
    expect(tree[0]?.inspectorNodeId).toBe("orphan-node");
    expect(tree[0]?.canvasNodeId).toBe("orphan-node");
    expect(tree[0]?.children).toEqual([]);
    expect(tree[0]?.isLeaf).toBe(true);
  });

  it("keeps the execution row id for the inspector and the workflow node id for the canvas", () => {
    const tree = WorkflowExecutionTreeBuilder.build([
      {
        node: {
          id: "specialist:run-1",
          kind: "node",
          type: "OpenAI",
          name: "Specialist call",
        } as any,
        snapshot: {
          runId: "run-1",
          workflowId: "wf-1",
          nodeId: "specialist:run-1",
          status: "completed",
          updatedAt: "2026-01-01T00:00:00.000Z",
        } as any,
        workflowNodeId: "specialist",
      } satisfies ExecutionNode,
    ]);

    expect(tree[0]?.inspectorNodeId).toBe("specialist:run-1");
    expect(tree[0]?.canvasNodeId).toBe("specialist");
  });

  it("collects only expandable branch keys", () => {
    const tree = WorkflowExecutionTreeBuilder.build([
      {
        node: {
          id: "agent-root",
          kind: "node",
          type: "AIAgent",
          name: "Coordinator",
        } as any,
        snapshot: {
          runId: "run-1",
          workflowId: "wf-1",
          nodeId: "agent-root",
          status: "completed",
          updatedAt: "2026-01-01T00:00:00.000Z",
        } as any,
        workflowNodeId: "agent-root",
      } satisfies ExecutionNode,
      {
        node: {
          id: "specialist",
          kind: "node",
          type: "AIAgent",
          name: "Specialist",
          parentNodeId: "agent-root",
        } as any,
        snapshot: {
          runId: "run-1",
          workflowId: "wf-1",
          nodeId: "specialist",
          status: "completed",
          updatedAt: "2026-01-01T00:00:01.000Z",
          parent: { runId: "run-1", workflowId: "wf-1", nodeId: "agent-root" },
        } as any,
        workflowNodeId: "specialist",
      } satisfies ExecutionNode,
    ]);

    expect(WorkflowExecutionTreeBuilder.collectBranchKeys(tree)).toEqual(["agent-root"]);
  });

  it("resolves selection keys for workflow attachment ids even when execution ids collide", () => {
    const executionNodes = [
      {
        node: {
          id: "attachment-node",
          kind: "node",
          type: "OpenAI",
          name: "Attachment A",
        } as any,
        snapshot: {
          runId: "run-1",
          workflowId: "wf-1",
          nodeId: "attachment-node",
          status: "completed",
          updatedAt: "2026-01-01T00:00:00.000Z",
        } as any,
        workflowNodeId: "specialist",
      } satisfies ExecutionNode,
      {
        node: {
          id: "attachment-node",
          kind: "node",
          type: "OpenAI",
          name: "Attachment B",
        } as any,
        snapshot: {
          runId: "run-1",
          workflowId: "wf-1",
          nodeId: "attachment-node",
          status: "completed",
          updatedAt: "2026-01-01T00:00:01.000Z",
        } as any,
        workflowNodeId: "specialist",
        workflowConnectionNodeId: "specialist",
      } satisfies ExecutionNode,
    ] satisfies ReadonlyArray<ExecutionNode>;

    expect(WorkflowExecutionTreeBuilder.resolveSelectionKey(executionNodes, null)).toBeNull();
    expect(WorkflowExecutionTreeBuilder.resolveSelectionKey(executionNodes, "specialist")).toBe("attachment-node__1");
  });
});

describe("WorkflowExecutionTreeDataLoaderAdapter", () => {
  it("creates a root item and child id registry for the headless tree", () => {
    const model = WorkflowExecutionTreeDataLoaderAdapter.create([
      {
        key: "agent-root",
        workflowNode: {
          id: "agent-root",
          kind: "node",
          type: "AIAgent",
          name: "Coordinator",
        } as any,
        snapshot: {
          runId: "run-1",
          workflowId: "wf-1",
          nodeId: "agent-root",
          status: "completed",
          updatedAt: "2026-01-01T00:00:00.000Z",
        } as any,
        inspectorNodeId: "agent-root",
        canvasNodeId: "agent-root",
        children: [
          {
            key: "openai-call",
            workflowNode: {
              id: "openai-call",
              kind: "node",
              type: "OpenAI",
              name: "OpenAI",
            } as any,
            snapshot: {
              runId: "run-1",
              workflowId: "wf-1",
              nodeId: "openai-call",
              status: "completed",
              updatedAt: "2026-01-01T00:00:01.000Z",
            } as any,
            inspectorNodeId: "openai-call#1",
            canvasNodeId: "agent-root",
            children: [],
            isLeaf: true,
          },
        ],
        isLeaf: false,
      },
    ]);

    const rootChildren = model.childIdsByParentId.get(model.rootItemId);
    const rootItem = model.itemDataById.get(model.rootItemId);
    const childItem = model.itemDataById.get("agent-root");

    expect(rootChildren).toEqual(["agent-root"]);
    expect(rootItem?.childKeys).toEqual(["agent-root"]);
    expect(childItem?.childKeys).toEqual(["openai-call"]);
    expect(childItem?.inspectorNodeId).toBe("agent-root");
    expect(childItem?.canvasNodeId).toBe("agent-root");
    expect(model.itemDataById.get("openai-call")?.inspectorNodeId).toBe("openai-call#1");
    expect(model.itemDataById.get("openai-call")?.canvasNodeId).toBe("agent-root");
  });
});
