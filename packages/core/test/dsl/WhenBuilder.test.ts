import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { WorkflowBuilder } from "../../src/workflow/dsl/WorkflowBuilder";
import { WhenBuilder } from "../../src/workflow/dsl/WhenBuilder";

// Minimal stub node configs for DSL wiring tests — no real execution needed.
function makeNodeConfig(name: string, id: string): { kind: "node"; type: object; name: string; id: string } {
  return { kind: "node", type: { name }, name, id };
}

describe("WhenBuilder", () => {
  function makeWf() {
    return new WorkflowBuilder({ id: "wf-when-test", name: "WhenBuilder test" });
  }

  it("build() delegates to WorkflowBuilder.build()", () => {
    const wf = makeWf();
    const trigger = (wf as any).add(makeNodeConfig("Trigger", "trigger"));
    const whenBuilder = new WhenBuilder(wf, trigger, "true");
    const def = whenBuilder.build();
    assert.equal(def.id, "wf-when-test");
    assert.equal(def.name, "WhenBuilder test");
  });

  it("when(true, steps) connects steps to 'true' output port", () => {
    const wf = makeWf();
    const trigger = (wf as any).add(makeNodeConfig("Trigger", "trigger"));
    const whenBuilder = new WhenBuilder<unknown>(wf, trigger, "main");
    const step1 = makeNodeConfig("Step1", "step1");
    whenBuilder.when(true, [step1]);
    const def = whenBuilder.build();
    // An edge should connect from trigger to step1 via 'true' port
    const edge = def.edges.find((e) => e.from.nodeId === "trigger" && e.from.output === "true");
    assert.ok(edge, "Expected edge from trigger via 'true' output");
    assert.equal(edge.to.nodeId, "step1");
  });

  it("when(false, steps) connects steps to 'false' output port", () => {
    const wf = makeWf();
    const trigger = (wf as any).add(makeNodeConfig("Trigger", "trigger"));
    const whenBuilder = new WhenBuilder<unknown>(wf, trigger, "main");
    const step1 = makeNodeConfig("StepFalse", "step-false");
    whenBuilder.when(false, [step1]);
    const def = whenBuilder.build();
    const edge = def.edges.find((e) => e.from.nodeId === "trigger" && e.from.output === "false");
    assert.ok(edge, "Expected edge from trigger via 'false' output");
    assert.equal(edge.to.nodeId, "step-false");
  });

  it("when() accepts variadic steps (non-array form)", () => {
    const wf = makeWf();
    const trigger = (wf as any).add(makeNodeConfig("Trigger", "trigger-variadic"));
    const whenBuilder = new WhenBuilder<unknown>(wf, trigger, "main");
    const step1 = makeNodeConfig("VarStep1", "var-step1");
    const step2 = makeNodeConfig("VarStep2", "var-step2");
    whenBuilder.when(true, step1, step2);
    const def = whenBuilder.build();
    const firstEdge = def.edges.find((e) => e.from.nodeId === "trigger-variadic" && e.from.output === "true");
    assert.ok(firstEdge, "Expected edge from trigger via 'true'");
    const chainEdge = def.edges.find((e) => e.from.nodeId === "var-step1");
    assert.ok(chainEdge, "Expected chaining edge from step1 to step2");
    assert.equal(chainEdge.to.nodeId, "var-step2");
  });

  it("addBranch() chains steps in sequence after the branch port", () => {
    const wf = makeWf();
    const trigger = (wf as any).add(makeNodeConfig("Trigger", "trigger-chain"));
    const whenBuilder = new WhenBuilder<unknown>(wf, trigger, "true");
    const a = makeNodeConfig("StepA", "step-a");
    const b = makeNodeConfig("StepB", "step-b");
    whenBuilder.addBranch([a, b]);
    const def = whenBuilder.build();
    // First step connected via 'true' from trigger
    const firstEdge = def.edges.find((e) => e.from.nodeId === "trigger-chain" && e.from.output === "true");
    assert.ok(firstEdge, "step-a should be connected via 'true' from trigger");
    assert.equal(firstEdge.to.nodeId, "step-a");
    // Second step chained from first via 'main'
    const chainEdge = def.edges.find((e) => e.from.nodeId === "step-a" && e.from.output === "main");
    assert.ok(chainEdge, "step-b should be chained from step-a");
    assert.equal(chainEdge.to.nodeId, "step-b");
  });

  it("addBranch() resolves upstream-ref placeholders to concrete nodeIds", () => {
    const wf = makeWf();
    const trigger = (wf as any).add(makeNodeConfig("Trigger", "trigger-ref"));
    const whenBuilder = new WhenBuilder<unknown>(wf, trigger, "true");

    const stepA: any = makeNodeConfig("StepRef0", "step-ref0");
    const stepB: any = makeNodeConfig("StepRef1", "step-ref1");
    // Attach an upstream ref placeholder pointing at index 0 (stepA)
    stepB.upstreamRefs = ["$0"];

    whenBuilder.addBranch([stepA, stepB]);

    // After addBranch, stepB.upstreamRefs should be resolved to { nodeId: "step-ref0" }
    assert.deepEqual(stepB.upstreamRefs, [{ nodeId: "step-ref0" }]);
  });

  it("addBranch() leaves non-placeholder upstreamRefs unchanged", () => {
    const wf = makeWf();
    const trigger = (wf as any).add(makeNodeConfig("Trigger", "trigger-keep"));
    const whenBuilder = new WhenBuilder<unknown>(wf, trigger, "true");

    const stepA: any = makeNodeConfig("StepKeep0", "step-keep0");
    const stepB: any = makeNodeConfig("StepKeep1", "step-keep1");
    const existingRef = { nodeId: "some-other-node" };
    stepB.upstreamRefs = [existingRef];

    whenBuilder.addBranch([stepA, stepB]);

    assert.deepEqual(stepB.upstreamRefs, [{ nodeId: "some-other-node" }]);
  });

  it("when() returns a WhenBuilder so further when() calls can be chained", () => {
    const wf = makeWf();
    const trigger = (wf as any).add(makeNodeConfig("Trigger", "trigger-chain2"));
    const whenBuilder = new WhenBuilder<unknown>(wf, trigger, "main");
    const step1 = makeNodeConfig("TrueStep", "true-step");
    const result = whenBuilder.when(true, [step1]);
    assert.ok(result instanceof WhenBuilder, "when() should return a WhenBuilder");
    const def = result.build();
    assert.equal(def.id, "wf-when-test");
  });
});
