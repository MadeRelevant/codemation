/**
 * Tests for WorkflowExecutionTreeBuilder — pure static class that transforms
 * a flat ExecutionNode list into a nested ExecutionTreeNode tree.
 */
import { describe, expect, test } from "vitest";
import { WorkflowExecutionTreeBuilder } from "../../src/lib/workflowDetail/WorkflowExecutionTreeBuilder";
import type { ExecutionNode } from "../../src/lib/workflowDetail/workflowDetailTypes";

function makeNode(id: string, overrides: Partial<ExecutionNode> = {}): ExecutionNode {
  return {
    node: { id, type: "test-node", name: id, parentNodeId: undefined } as never,
    ...overrides,
  };
}

describe("WorkflowExecutionTreeBuilder.build", () => {
  test("returns empty array for empty input", () => {
    expect(WorkflowExecutionTreeBuilder.build([])).toEqual([]);
  });

  test("returns single root node for a single entry", () => {
    const result = WorkflowExecutionTreeBuilder.build([makeNode("n1")]);
    expect(result).toHaveLength(1);
    expect(result[0]!.key).toBe("n1");
    expect(result[0]!.isLeaf).toBe(true);
    expect(result[0]!.children).toHaveLength(0);
  });

  test("builds parent-child relationship via node.parentNodeId", () => {
    const parent = makeNode("parent");
    const child: ExecutionNode = {
      node: { id: "child", type: "test-node", name: "child", parentNodeId: "parent" } as never,
    };
    const result = WorkflowExecutionTreeBuilder.build([parent, child]);
    expect(result).toHaveLength(1);
    expect(result[0]!.key).toBe("parent");
    expect(result[0]!.children).toHaveLength(1);
    expect(result[0]!.children[0]!.key).toBe("child");
    expect(result[0]!.isLeaf).toBe(false);
  });

  test("uses name as title when available", () => {
    const node: ExecutionNode = {
      node: { id: "n1", type: "my-type", name: "My Node" } as never,
    };
    const result = WorkflowExecutionTreeBuilder.build([node]);
    expect(result[0]!.title).toBe("My Node");
  });

  test("falls back to type when name is absent", () => {
    const node: ExecutionNode = {
      node: { id: "n1", type: "my-type", name: undefined } as never,
    };
    const result = WorkflowExecutionTreeBuilder.build([node]);
    expect(result[0]!.title).toBe("my-type");
  });

  test("falls back to id when name and type are absent", () => {
    const node: ExecutionNode = {
      node: { id: "n1", type: undefined, name: undefined } as never,
    };
    const result = WorkflowExecutionTreeBuilder.build([node]);
    expect(result[0]!.title).toBe("n1");
  });

  test("deduplicates keys when same node id appears multiple times", () => {
    const n1 = makeNode("shared");
    const n2 = makeNode("shared");
    const result = WorkflowExecutionTreeBuilder.build([n1, n2]);
    expect(result).toHaveLength(2);
    const keys = result.map((n) => n.key);
    expect(new Set(keys).size).toBe(2);
    // First occurrence keeps the raw id, second gets a suffix
    expect(keys[0]).toBe("shared");
    expect(keys[1]).toBe("shared__1");
  });

  test("multiple roots are all returned", () => {
    const result = WorkflowExecutionTreeBuilder.build([makeNode("a"), makeNode("b"), makeNode("c")]);
    expect(result).toHaveLength(3);
  });

  test("canvasNodeId uses workflowNodeId when set", () => {
    const node: ExecutionNode = {
      node: { id: "n1" } as never,
      workflowNodeId: "wf-node-1",
    };
    const result = WorkflowExecutionTreeBuilder.build([node]);
    expect(result[0]!.canvasNodeId).toBe("wf-node-1");
  });

  test("canvasNodeId falls back to node.id", () => {
    const node: ExecutionNode = { node: { id: "n1" } as never };
    const result = WorkflowExecutionTreeBuilder.build([node]);
    expect(result[0]!.canvasNodeId).toBe("n1");
  });

  test("resolves parent by parentInvocationId (highest priority)", () => {
    const parent: ExecutionNode = {
      node: { id: "parent" } as never,
      executionInstanceId: "inst-parent",
    };
    const child: ExecutionNode = {
      node: { id: "child", parentNodeId: undefined } as never,
      parentInvocationId: "inst-parent",
    };
    const result = WorkflowExecutionTreeBuilder.build([parent, child]);
    expect(result).toHaveLength(1);
    expect(result[0]!.children).toHaveLength(1);
  });

  test("resolves parent by parentExecutionInstanceId when parentInvocationId absent", () => {
    const parent: ExecutionNode = {
      node: { id: "parent" } as never,
      executionInstanceId: "inst-parent",
    };
    const child: ExecutionNode = {
      node: { id: "child", parentNodeId: undefined } as never,
      parentExecutionInstanceId: "inst-parent",
    };
    const result = WorkflowExecutionTreeBuilder.build([parent, child]);
    expect(result).toHaveLength(1);
    expect(result[0]!.children[0]!.key).toBe("child");
  });
});

describe("WorkflowExecutionTreeBuilder.collectBranchKeys", () => {
  test("returns empty array for leaf nodes", () => {
    const tree = WorkflowExecutionTreeBuilder.build([makeNode("a"), makeNode("b")]);
    expect(WorkflowExecutionTreeBuilder.collectBranchKeys(tree)).toEqual([]);
  });

  test("returns key of parent node that has children", () => {
    const parent = makeNode("parent");
    const child: ExecutionNode = {
      node: { id: "child", parentNodeId: "parent" } as never,
    };
    const tree = WorkflowExecutionTreeBuilder.build([parent, child]);
    const branchKeys = WorkflowExecutionTreeBuilder.collectBranchKeys(tree);
    expect(branchKeys).toContain("parent");
  });

  test("returns keys for nested branches recursively", () => {
    const grandparent = makeNode("gp");
    const parent: ExecutionNode = {
      node: { id: "p", parentNodeId: "gp" } as never,
    };
    const child: ExecutionNode = {
      node: { id: "c", parentNodeId: "p" } as never,
    };
    const tree = WorkflowExecutionTreeBuilder.build([grandparent, parent, child]);
    const branchKeys = WorkflowExecutionTreeBuilder.collectBranchKeys(tree);
    expect(branchKeys).toContain("gp");
    expect(branchKeys).toContain("p");
    expect(branchKeys).not.toContain("c");
  });
});

describe("WorkflowExecutionTreeBuilder.resolveSelectionKey", () => {
  test("returns null when selectedNodeId is null", () => {
    expect(WorkflowExecutionTreeBuilder.resolveSelectionKey([], null)).toBeNull();
  });

  test("returns tree key for a matching node id", () => {
    const nodes = [makeNode("n1"), makeNode("n2")];
    const key = WorkflowExecutionTreeBuilder.resolveSelectionKey(nodes, "n2");
    expect(key).toBe("n2");
  });

  test("returns selectedNodeId as fallback when no match found", () => {
    const nodes = [makeNode("n1")];
    const key = WorkflowExecutionTreeBuilder.resolveSelectionKey(nodes, "n-unknown");
    expect(key).toBe("n-unknown");
  });

  test("resolves by workflowConnectionNodeId", () => {
    const node: ExecutionNode = {
      node: { id: "n1" } as never,
      workflowConnectionNodeId: "conn-node",
    };
    const key = WorkflowExecutionTreeBuilder.resolveSelectionKey([node], "conn-node");
    expect(key).toBe("n1");
  });
});
