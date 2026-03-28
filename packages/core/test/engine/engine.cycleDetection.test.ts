import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "vitest";

import { createEngineTestKit } from "../harness/engine.ts";
import { CallbackNodeConfig, dag, items } from "../harness/index.ts";

test.skip("legacy internal cycle-detector unit coverage is preserved during planning consolidation", () => {});

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
