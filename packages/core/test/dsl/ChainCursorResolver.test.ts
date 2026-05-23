/**
 * Tests for ChainCursor.thenIntoInputHints and ChainCursor.route —
 * branches not covered by WhenBuilder.test.ts.
 */
import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { WorkflowBuilder } from "../../src/workflow/dsl/WorkflowBuilder";
import { ChainCursor } from "../../src/workflow/dsl/ChainCursorResolver";

function makeNodeConfig(name: string, id: string) {
  return { kind: "node" as const, type: class {}, name, id };
}

describe("ChainCursor.thenIntoInputHints", () => {
  it("connects endpoints with their inputPortHint as the target input port", () => {
    const wf = new WorkflowBuilder({ id: "wf-1", name: "T" });
    const n1 = (wf as any).add(makeNodeConfig("N1", "n1"));
    const n2 = (wf as any).add(makeNodeConfig("N2", "n2"));
    // Two endpoints from different branch outputs, each carrying an inputPortHint
    const cursor = new ChainCursor<unknown>(wf, [
      { node: n1, output: "true", inputPortHint: "true" },
      { node: n2, output: "false", inputPortHint: "false" },
    ]);
    const next = makeNodeConfig("Merge", "merge");
    cursor.thenIntoInputHints(next);

    const def = wf.build();
    const trueEdge = def.edges.find((e) => e.from.nodeId === "n1" && e.to.nodeId === "merge");
    const falseEdge = def.edges.find((e) => e.from.nodeId === "n2" && e.to.nodeId === "merge");
    assert.ok(trueEdge, "Expected edge from n1 (true branch) to merge");
    assert.equal(trueEdge?.to.input, "true", "Edge input should use inputPortHint 'true'");
    assert.ok(falseEdge, "Expected edge from n2 (false branch) to merge");
    assert.equal(falseEdge?.to.input, "false", "Edge input should use inputPortHint 'false'");
  });

  it("falls back to 'in' when inputPortHint is absent", () => {
    const wf = new WorkflowBuilder({ id: "wf-2", name: "T" });
    const n1 = (wf as any).add(makeNodeConfig("N1", "n1b"));
    const cursor = new ChainCursor<unknown>(wf, [{ node: n1, output: "main" }]); // no inputPortHint
    const next = makeNodeConfig("Next", "next-b");
    cursor.thenIntoInputHints(next);
    const def = wf.build();
    const edge = def.edges.find((e) => e.from.nodeId === "n1b" && e.to.nodeId === "next-b");
    assert.ok(edge, "Expected edge from n1b to next-b");
    assert.equal(edge?.to.input, "in");
  });
});

describe("ChainCursor.route", () => {
  it("builds branched cursor with outputs routed to a shared continuation", () => {
    const wf = new WorkflowBuilder({ id: "wf-route", name: "Route" });
    const branch = (wf as any).add(makeNodeConfig("Branch", "branch"));
    const cursor = new ChainCursor<unknown>(wf, [{ node: branch, output: "main" }]);

    const trueStep = makeNodeConfig("TrueStep", "true-step");
    const falseStep = makeNodeConfig("FalseStep", "false-step");

    const merged = cursor.route({
      true: (c) => c.then(trueStep),
      false: (c) => c.then(falseStep),
    });

    // merged.build() should produce valid workflow
    const def = merged.build();
    const trueEdge = def.edges.find((e) => e.from.nodeId === "branch" && e.from.output === "true");
    assert.ok(trueEdge, "Expected edge from branch via 'true'");
    assert.equal(trueEdge?.to.nodeId, "true-step");
    const falseEdge = def.edges.find((e) => e.from.nodeId === "branch" && e.from.output === "false");
    assert.ok(falseEdge, "Expected edge from branch via 'false'");
    assert.equal(falseEdge?.to.nodeId, "false-step");
  });

  it("skips branches where factory returns undefined", () => {
    const wf = new WorkflowBuilder({ id: "wf-route-skip", name: "Route Skip" });
    const branch = (wf as any).add(makeNodeConfig("Branch", "branch-skip"));
    const cursor = new ChainCursor<unknown>(wf, [{ node: branch, output: "main" }]);

    const trueStep = makeNodeConfig("OnlyTrue", "only-true");
    const merged = cursor.route({
      true: (c) => c.then(trueStep),
      false: () => undefined, // returns undefined → skipped
    });

    const def = merged.build();
    // only-true should be connected; false branch should not exist
    const trueEdge = def.edges.find((e) => e.from.nodeId === "branch-skip" && e.from.output === "true");
    assert.ok(trueEdge);
    const falseEdge = def.edges.find((e) => e.from.nodeId === "branch-skip" && e.from.output === "false");
    assert.equal(falseEdge, undefined, "false branch should be absent");
  });

  it("throws when route is called with multiple cursor endpoints", () => {
    const wf = new WorkflowBuilder({ id: "wf-route-multi", name: "Multi" });
    const n1 = (wf as any).add(makeNodeConfig("N1", "r-n1"));
    const n2 = (wf as any).add(makeNodeConfig("N2", "r-n2"));
    const cursor = new ChainCursor<unknown>(wf, [
      { node: n1, output: "main" },
      { node: n2, output: "main" },
    ]);
    assert.throws(
      () =>
        cursor.route({
          main: (c) => c.then(makeNodeConfig("S", "s")),
        }),
      /only supported from a single cursor endpoint/,
    );
  });
});
