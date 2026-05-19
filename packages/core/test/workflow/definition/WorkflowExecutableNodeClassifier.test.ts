import "reflect-metadata";

import assert from "node:assert/strict";
import { test, describe } from "vitest";

import { WorkflowExecutableNodeClassifier } from "../../../src/workflow/definition/WorkflowExecutableNodeClassifier";
import type { WorkflowDefinition } from "../../../src/types";

function makeNode(id: string, kind: "node" | "trigger" = "node"): WorkflowDefinition["nodes"][number] {
  return {
    id,
    kind,
    name: id,
    type: class {},
    config: { kind: "node", type: class {}, name: id },
  };
}

function makeWorkflow(
  nodes: WorkflowDefinition["nodes"],
  edges: WorkflowDefinition["edges"] = [],
  connections?: WorkflowDefinition["connections"],
): WorkflowDefinition {
  return { id: "wf-1", name: "test", nodes, edges, connections };
}

describe("WorkflowExecutableNodeClassifier", () => {
  test("isConnectionOwnedNodeId returns false when no connections", () => {
    const classifier = new WorkflowExecutableNodeClassifier(makeWorkflow([makeNode("n1")]));
    assert.equal(classifier.isConnectionOwnedNodeId("n1"), false);
  });

  test("isConnectionOwnedNodeId returns true for child in connections", () => {
    const wf = makeWorkflow([makeNode("parent"), makeNode("child")], [], [
      { childNodeIds: ["child"] },
    ] as WorkflowDefinition["connections"]);
    const classifier = new WorkflowExecutableNodeClassifier(wf);
    assert.equal(classifier.isConnectionOwnedNodeId("child"), true);
    assert.equal(classifier.isConnectionOwnedNodeId("parent"), false);
  });

  test("isExecutableNodeId is the inverse of isConnectionOwnedNodeId", () => {
    const wf = makeWorkflow([makeNode("parent"), makeNode("child")], [], [
      { childNodeIds: ["child"] },
    ] as WorkflowDefinition["connections"]);
    const classifier = new WorkflowExecutableNodeClassifier(wf);
    assert.equal(classifier.isExecutableNodeId("child"), false);
    assert.equal(classifier.isExecutableNodeId("parent"), true);
  });

  test("filterExecutableNodeDefinitions removes connection-owned nodes", () => {
    const parent = makeNode("parent");
    const child = makeNode("child");
    const wf = makeWorkflow([parent, child], [], [{ childNodeIds: ["child"] }] as WorkflowDefinition["connections"]);
    const classifier = new WorkflowExecutableNodeClassifier(wf);
    const filtered = classifier.filterExecutableNodeDefinitions([parent, child]);
    assert.deepEqual(
      filtered.map((n) => n.id),
      ["parent"],
    );
  });

  test("findDefaultExecutableStartNodeId returns first trigger when present", () => {
    const trigger = makeNode("t1", "trigger");
    const node = makeNode("n1", "node");
    const wf = makeWorkflow(
      [trigger, node],
      [{ from: { nodeId: "t1", output: "main" }, to: { nodeId: "n1", input: "in" } }],
    );
    const classifier = new WorkflowExecutableNodeClassifier(wf);
    assert.equal(classifier.findDefaultExecutableStartNodeId(wf), "t1");
  });

  test("findDefaultExecutableStartNodeId returns root node when no trigger", () => {
    // n1 → n2: n2 has incoming edge so root should be n1
    const n1 = makeNode("n1");
    const n2 = makeNode("n2");
    const wf = makeWorkflow([n1, n2], [{ from: { nodeId: "n1", output: "main" }, to: { nodeId: "n2", input: "in" } }]);
    const classifier = new WorkflowExecutableNodeClassifier(wf);
    assert.equal(classifier.findDefaultExecutableStartNodeId(wf), "n1");
  });

  test("findDefaultExecutableStartNodeId throws when no executable nodes", () => {
    const child = makeNode("child");
    const wf = makeWorkflow([child], [], [{ childNodeIds: ["child"] }] as WorkflowDefinition["connections"]);
    const classifier = new WorkflowExecutableNodeClassifier(wf);
    assert.throws(() => classifier.findDefaultExecutableStartNodeId(wf), /has no executable nodes/);
  });

  test("firstExecutableNodeIdInDefinitionOrder returns first non-connection-owned node", () => {
    const child = makeNode("child");
    const exec = makeNode("exec");
    const wf = makeWorkflow([child, exec], [], [{ childNodeIds: ["child"] }] as WorkflowDefinition["connections"]);
    const classifier = new WorkflowExecutableNodeClassifier(wf);
    assert.equal(classifier.firstExecutableNodeIdInDefinitionOrder(wf), "exec");
  });

  test("firstExecutableNodeIdInDefinitionOrder returns undefined for empty workflow", () => {
    const wf = makeWorkflow([]);
    const classifier = new WorkflowExecutableNodeClassifier(wf);
    assert.equal(classifier.firstExecutableNodeIdInDefinitionOrder(wf), undefined);
  });

  test("lastExecutableNodeIdInDefinitionOrder returns last executable node", () => {
    const n1 = makeNode("n1");
    const n2 = makeNode("n2");
    const child = makeNode("child");
    const wf = makeWorkflow([n1, n2, child], [], [{ childNodeIds: ["child"] }] as WorkflowDefinition["connections"]);
    const classifier = new WorkflowExecutableNodeClassifier(wf);
    assert.equal(classifier.lastExecutableNodeIdInDefinitionOrder(wf), "n2");
  });

  test("lastExecutableNodeIdInDefinitionOrder throws when no executable nodes", () => {
    const child = makeNode("child");
    const wf = makeWorkflow([child], [], [{ childNodeIds: ["child"] }] as WorkflowDefinition["connections"]);
    const classifier = new WorkflowExecutableNodeClassifier(wf);
    assert.throws(() => classifier.lastExecutableNodeIdInDefinitionOrder(wf), /has no executable nodes/);
  });
});
