import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "vitest";

import { createEngineTestKit } from "../harness/engine.ts";
import { CallbackNodeConfig, dag, items } from "../harness/index.ts";

function linearWorkflow(nodeCount: number) {
  const b = dag({ id: "wf.activation.budget", name: "Linear" });
  const ids: string[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const id = `n${i}`;
    b.add(new CallbackNodeConfig(id, () => {}, { id }));
    ids.push(id);
  }
  for (let i = 0; i < nodeCount - 1; i++) {
    b.connect(ids[i]!, ids[i + 1]!);
  }
  return b.build();
}

test("run fails when maxNodeActivations would be exceeded", async () => {
  const wf = linearWorkflow(10);
  const kit = await createEngineTestKit();
  await kit.start([wf]);
  const result = await kit.engine.runWorkflow(wf, "n0", items([{ v: 1 }]), undefined, { maxNodeActivations: 5 });
  if (result.status !== "pending") {
    assert.fail("expected pending then failure");
  }
  const done = await kit.engine.waitForCompletion(result.runId);
  assert.equal(done.status, "failed");
  assert.match(done.error.message, /maxNodeActivations/);
}, 2000);
