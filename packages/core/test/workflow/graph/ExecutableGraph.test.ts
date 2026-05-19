import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { ExecutableGraph } from "../../../src/workflow/graph/ExecutableGraph";
import type { WorkflowDefinition } from "../../../src/contracts/workflowTypes";

function makeWorkflow(edges: WorkflowDefinition["edges"]): WorkflowDefinition {
  return { id: "wf-1", name: "test", nodes: [], edges };
}

describe("ExecutableGraph", () => {
  test("next returns empty array when node has no outgoing edges", () => {
    const graph = new ExecutableGraph(makeWorkflow([]));
    assert.deepEqual(graph.next("nodeA", "main"), []);
  });

  test("next returns all downstream connections for a given port", () => {
    const graph = new ExecutableGraph(
      makeWorkflow([
        { from: { nodeId: "A", output: "main" }, to: { nodeId: "B", input: "in" } },
        { from: { nodeId: "A", output: "main" }, to: { nodeId: "C", input: "in" } },
      ]),
    );
    const result = graph.next("A", "main");
    assert.equal(result.length, 2);
    assert.ok(result.some((r) => r.nodeId === "B" && r.input === "in"));
    assert.ok(result.some((r) => r.nodeId === "C" && r.input === "in"));
  });

  test("next for a different output port returns only edges from that port", () => {
    const graph = new ExecutableGraph(
      makeWorkflow([
        { from: { nodeId: "A", output: "true" }, to: { nodeId: "B", input: "in" } },
        { from: { nodeId: "A", output: "false" }, to: { nodeId: "C", input: "in" } },
      ]),
    );
    assert.deepEqual(graph.next("A", "true"), [{ nodeId: "B", input: "in" }]);
    assert.deepEqual(graph.next("A", "false"), [{ nodeId: "C", input: "in" }]);
  });

  test("next returns empty array for an unknown port on a known node", () => {
    const graph = new ExecutableGraph(
      makeWorkflow([{ from: { nodeId: "A", output: "main" }, to: { nodeId: "B", input: "in" } }]),
    );
    assert.deepEqual(graph.next("A", "nonexistent"), []);
  });
});
