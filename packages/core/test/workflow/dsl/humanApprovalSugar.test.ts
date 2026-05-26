/**
 * Unit tests for Story 11: ChainCursor.humanApproval() DSL sugar.
 *
 * Tests exercise:
 * - `.humanApproval(node, config)` produces the same compiled graph
 *   as `.then(node.create(config))`.
 * - `.humanApproval()` throws at call-time when given a non-HITL node.
 * - `isHumanApprovalNode()` returns true for nodes created via
 *   `defineHumanApprovalNode` and false for plain nodes.
 */

import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { z } from "zod";

import { defineHumanApprovalNode, isHumanApprovalNode } from "../../../src/authoring/defineHumanApprovalNode.types";
import { defineNode } from "../../../src/authoring/defineNode.types";
import { WorkflowBuilder } from "../../../src/workflow/dsl/WorkflowBuilder";
import { ChainCursor } from "../../../src/workflow/dsl/ChainCursorResolver";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const minimalApprovalNode = defineHumanApprovalNode({
  key: "test.approval",
  title: "Approve",
  channel: "inbox",
  configSchema: z.object({ title: z.string() }),
  decisionSchema: z.object({ approved: z.boolean() }),
  async deliver() {
    return { delivered: true };
  },
});

const nonHitlNode = defineNode({
  key: "test.regular",
  title: "Regular",
  configSchema: z.object({}),
  async execute() {
    return {};
  },
});

function makeConfig() {
  return {
    kind: "node" as const,
    type: class {},
    name: "Start",
    id: "start",
  };
}

// ---------------------------------------------------------------------------
// isHumanApprovalNode predicate
// ---------------------------------------------------------------------------

describe("isHumanApprovalNode", () => {
  it("returns true for a node created via defineHumanApprovalNode", () => {
    assert.ok(isHumanApprovalNode(minimalApprovalNode));
  });

  it("returns false for a plain defineNode result", () => {
    assert.equal(isHumanApprovalNode(nonHitlNode), false);
  });

  it("returns false for arbitrary objects", () => {
    assert.equal(isHumanApprovalNode({}), false);
    assert.equal(isHumanApprovalNode(null), false);
    assert.equal(isHumanApprovalNode(undefined), false);
    assert.equal(isHumanApprovalNode(42), false);
  });
});

// ---------------------------------------------------------------------------
// ChainCursor.humanApproval() sugar
// ---------------------------------------------------------------------------

describe("ChainCursor.humanApproval()", () => {
  it("produces the same graph as calling .then(node.create(config))", () => {
    const config = { title: "Please approve" };

    // Build via sugar
    const wfSugar = new WorkflowBuilder({ id: "wf-sugar", name: "Sugar" });
    const startCfgA = makeConfig();
    const startCfgA2 = { ...makeConfig(), id: "start2" };
    const sugarDef = wfSugar
      .start(startCfgA)
      .humanApproval(minimalApprovalNode, config)
      .build();

    // Build via explicit .then()
    const wfExplicit = new WorkflowBuilder({ id: "wf-explicit", name: "Explicit" });
    const explicitDef = wfExplicit
      .start(startCfgA2)
      .then(minimalApprovalNode.create(config as never))
      .build();

    // Both should have the same number of nodes and edges
    assert.equal(sugarDef.nodes.length, explicitDef.nodes.length, "node count should match");
    assert.equal(sugarDef.edges.length, explicitDef.edges.length, "edge count should match");

    // The HITL node should be of type `inbox.approval` in both
    const sugarHitlNode = sugarDef.nodes.find((n) => n.type !== startCfgA.type);
    const explicitHitlNode = explicitDef.nodes.find((n) => n.type !== startCfgA2.type);
    assert.ok(sugarHitlNode, "sugar graph should contain the HITL node");
    assert.ok(explicitHitlNode, "explicit graph should contain the HITL node");
    assert.equal(sugarHitlNode?.name, explicitHitlNode?.name, "HITL node names should match");
  });

  it("throws when given a non-HITL node", () => {
    const wf = new WorkflowBuilder({ id: "wf-throw", name: "Throw" });
    const startRef = (wf as never as { add(c: never): { id: string; kind: "node"; name?: string } }).add(
      makeConfig() as never,
    );
    const cursor = new ChainCursor<Record<string, unknown>>(wf, [{ node: startRef, output: "main" }]);

    assert.throws(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => cursor.humanApproval(nonHitlNode as any, {}),
      /defineHumanApprovalNode/,
    );
  });

  it("passes metadata name and nodeId through to the created config", () => {
    const wf = new WorkflowBuilder({ id: "wf-meta", name: "Meta" });
    const def = wf
      .start(makeConfig())
      .humanApproval(minimalApprovalNode, { title: "Check" }, { name: "My Approval", nodeId: "my-approval" })
      .build();

    const hitlNode = def.nodes.find((n) => n.id === "my-approval");
    assert.ok(hitlNode, "should find node with explicit id 'my-approval'");
    assert.equal(hitlNode?.name, "My Approval");
  });
});
