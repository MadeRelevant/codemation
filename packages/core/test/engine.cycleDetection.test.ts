import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "vitest";

import { DirectedCycleDetector } from "../src/engine/domain/planning/DirectedCycleDetector.ts";
import { createEngineTestKit } from "./harness/engine.ts";
import { CallbackNodeConfig, dag, items } from "./harness/index.ts";

test("DirectedCycleDetector rejects A -> B -> A", () => {
  const b = dag({ id: "wf.cycle.ab", name: "Cycle AB" });
  const a = b.add(new CallbackNodeConfig("A", () => {}, { id: "A" }));
  const nodeB = b.add(new CallbackNodeConfig("B", () => {}, { id: "B" }));
  b.connect(a, nodeB);
  b.connect(nodeB, a);
  const wf = b.build();
  assert.throws(() => new DirectedCycleDetector().validateAcyclic(wf), /directed cycle/);
});

test("DirectedCycleDetector rejects self-loop", () => {
  const b = dag({ id: "wf.cycle.self", name: "Self" });
  const a = b.add(new CallbackNodeConfig("A", () => {}, { id: "A" }));
  b.connect(a, a);
  const wf = b.build();
  assert.throws(() => new DirectedCycleDetector().validateAcyclic(wf), /directed cycle/);
});

test("runWorkflow fails planning for cyclic graph", async () => {
  const b = dag({ id: "wf.cycle.run", name: "Run" });
  const a = b.add(new CallbackNodeConfig("A", () => {}, { id: "A" }));
  const nodeB = b.add(new CallbackNodeConfig("B", () => {}, { id: "B" }));
  b.connect(a, nodeB);
  b.connect(nodeB, a);
  const wf = b.build();
  const kit = await createEngineTestKit();
  await kit.start([wf]);
  await assert.rejects(() => kit.engine.runWorkflow(wf, "A", items([{ v: 1 }]), undefined), /directed cycle/);
});
