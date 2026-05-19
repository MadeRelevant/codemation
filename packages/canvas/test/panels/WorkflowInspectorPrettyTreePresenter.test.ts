// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { WorkflowInspectorPrettyTreePresenter } from "../../src/panels/WorkflowInspectorPrettyTreePresenter";

describe("WorkflowInspectorPrettyTreePresenter.buildTreeData", () => {
  it("returns empty array for undefined", () => {
    expect(WorkflowInspectorPrettyTreePresenter.buildTreeData(undefined)).toEqual([]);
  });

  it("returns single scalar leaf node for a string", () => {
    const result = WorkflowInspectorPrettyTreePresenter.buildTreeData("hello");
    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe("value");
    expect(result[0]!.isLeaf).toBe(true);
    expect(result[0]!.key).toBe("pretty-root.value");
    expect(result[0]!.children).toBeUndefined();
  });

  it("returns single scalar leaf node for a number", () => {
    const result = WorkflowInspectorPrettyTreePresenter.buildTreeData(42);
    expect(result).toHaveLength(1);
    expect(result[0]!.isLeaf).toBe(true);
  });

  it("returns single scalar leaf node for boolean", () => {
    const result = WorkflowInspectorPrettyTreePresenter.buildTreeData(true);
    expect(result).toHaveLength(1);
    expect(result[0]!.isLeaf).toBe(true);
  });

  it("returns single scalar leaf node for null", () => {
    const result = WorkflowInspectorPrettyTreePresenter.buildTreeData(null);
    expect(result).toHaveLength(1);
    expect(result[0]!.isLeaf).toBe(true);
  });

  it("returns empty-collection node for empty array", () => {
    const result = WorkflowInspectorPrettyTreePresenter.buildTreeData([]);
    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe("value");
    expect(result[0]!.isLeaf).toBe(true);
  });

  it("returns index-labelled nodes for non-empty array", () => {
    const result = WorkflowInspectorPrettyTreePresenter.buildTreeData(["a", "b"]);
    expect(result).toHaveLength(2);
    expect(result[0]!.label).toBe("[0]");
    expect(result[1]!.label).toBe("[1]");
  });

  it("returns empty-collection node for empty object", () => {
    const result = WorkflowInspectorPrettyTreePresenter.buildTreeData({});
    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe("value");
    expect(result[0]!.isLeaf).toBe(true);
  });

  it("returns key-labelled nodes for non-empty object", () => {
    const result = WorkflowInspectorPrettyTreePresenter.buildTreeData({ x: 1, y: 2 });
    expect(result).toHaveLength(2);
    const labels = result.map((n) => n.label);
    expect(labels).toContain("x");
    expect(labels).toContain("y");
  });

  it("creates nested children for nested object", () => {
    const result = WorkflowInspectorPrettyTreePresenter.buildTreeData({ outer: { inner: "v" } });
    expect(result).toHaveLength(1);
    const outer = result[0]!;
    expect(outer.label).toBe("outer");
    expect(outer.isLeaf).toBe(false);
    expect(outer.children).toHaveLength(1);
    expect(outer.children![0]!.label).toBe("inner");
    expect(outer.children![0]!.isLeaf).toBe(true);
  });

  it("creates nested children for array of objects", () => {
    const result = WorkflowInspectorPrettyTreePresenter.buildTreeData([{ a: 1 }]);
    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe("[0]");
    expect(result[0]!.isLeaf).toBe(false);
    expect(result[0]!.children).toHaveLength(1);
  });

  it("leaf node for string with newline sets multilineValue, not inlineValue", () => {
    const result = WorkflowInspectorPrettyTreePresenter.buildTreeData("line1\nline2");
    const node = result[0]!;
    expect(node.multilineValue).toBe("line1\nline2");
    expect(node.inlineValue).toBeUndefined();
  });

  it("leaf node for empty array within object is a leaf with inlineValue", () => {
    const result = WorkflowInspectorPrettyTreePresenter.buildTreeData({ arr: [] });
    const node = result[0]!;
    expect(node.label).toBe("arr");
    expect(node.isLeaf).toBe(true);
    expect(node.children).toBeUndefined();
  });

  it("leaf node for empty object within object is a leaf with inlineValue", () => {
    const result = WorkflowInspectorPrettyTreePresenter.buildTreeData({ obj: {} });
    const node = result[0]!;
    expect(node.label).toBe("obj");
    expect(node.isLeaf).toBe(true);
  });

  it("non-empty array within object creates a parent node with children (not a leaf)", () => {
    // Hits createNode branch: non-empty array → return { key, label, children, isLeaf: false }
    const result = WorkflowInspectorPrettyTreePresenter.buildTreeData({ arr: [1, 2] });
    const node = result[0]!;
    expect(node.label).toBe("arr");
    expect(node.isLeaf).toBe(false);
    expect(node.children).toHaveLength(2);
    expect(node.children![0]!.label).toBe("[0]");
    expect(node.children![1]!.label).toBe("[1]");
  });

  it("array element that is undefined gets an inlineValue via the renderInlineValue fallback", () => {
    // [undefined] → createNode called with undefined value → renderInlineValue(undefined) → fallback span
    const result = WorkflowInspectorPrettyTreePresenter.buildTreeData([undefined]);
    expect(result).toHaveLength(1);
    const node = result[0]!;
    expect(node.isLeaf).toBe(true);
    expect(node.inlineValue).not.toBeUndefined();
    expect(node.multilineValue).toBeUndefined();
  });
});

describe("WorkflowInspectorPrettyTreePresenter.collectKeys", () => {
  it("returns empty array when no nodes", () => {
    expect(WorkflowInspectorPrettyTreePresenter.collectKeys([])).toEqual([]);
  });

  it("returns empty array for all-leaf nodes (no children)", () => {
    const nodes = WorkflowInspectorPrettyTreePresenter.buildTreeData({ a: 1, b: 2 });
    expect(WorkflowInspectorPrettyTreePresenter.collectKeys(nodes)).toEqual([]);
  });

  it("returns keys of non-leaf parent nodes", () => {
    const nodes = WorkflowInspectorPrettyTreePresenter.buildTreeData({ outer: { inner: "v" } });
    const keys = WorkflowInspectorPrettyTreePresenter.collectKeys(nodes);
    expect(keys).toContain("pretty-root.outer");
  });

  it("returns all nested parent keys recursively", () => {
    const nodes = WorkflowInspectorPrettyTreePresenter.buildTreeData({ a: { b: { c: 1 } } });
    const keys = WorkflowInspectorPrettyTreePresenter.collectKeys(nodes);
    expect(keys.length).toBeGreaterThanOrEqual(2);
  });

  it("does not include leaf-only array root nodes", () => {
    const nodes = WorkflowInspectorPrettyTreePresenter.buildTreeData([1, 2, 3]);
    // Array items with scalar values are leaves — no keys collected
    const keys = WorkflowInspectorPrettyTreePresenter.collectKeys(nodes);
    expect(keys).toEqual([]);
  });

  it("includes array parent key when array items have children", () => {
    const nodes = WorkflowInspectorPrettyTreePresenter.buildTreeData([{ x: 1 }]);
    const keys = WorkflowInspectorPrettyTreePresenter.collectKeys(nodes);
    // The [0] node has a child, so its key is collected
    expect(keys.length).toBe(1);
    expect(keys[0]).toBe("pretty-root.0");
  });
});
