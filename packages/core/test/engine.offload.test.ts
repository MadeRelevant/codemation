import test from "node:test";
import assert from "node:assert/strict";

import { CallbackNodeConfig, CapturingScheduler, chain, createEngineTestKit, items } from "./harness/index.ts";

test("engine can offload a node (pending) and resume later", async () => {
  const events: string[] = [];

  const n1 = new CallbackNodeConfig("n1", () => events.push("n1"), { id: "n1" });
  const n2 = new CallbackNodeConfig("n2", () => events.push("n2"), {
    id: "n2",
    execution: { hint: "worker", queue: "q.default" },
  });
  const n3 = new CallbackNodeConfig("n3", () => events.push("n3"), { id: "n3" });

  const wf = chain({ id: "wf.offload", name: "Offload" }).start(n1).then(n2).then(n3).build();

  const kit = createEngineTestKit();
  await kit.start([wf]);

  const r1 = await kit.engine.runWorkflow(wf, "n1", items([{ a: 1 }]), undefined);
  assert.equal(r1.status, "pending");
  assert.equal(events.join(","), "n1");
  assert.equal(kit.activations.length, 1);
  assert.equal(kit.activations[0].nodeId, "n1");

  const storedPending = await kit.runStore.load(r1.runId);
  assert.ok(storedPending);
  assert.equal(storedPending.status, "pending");
  assert.equal(storedPending.pending?.nodeId, "n2");

  const scheduler = kit.scheduler as CapturingScheduler;
  assert.ok(scheduler.lastRequest);
  assert.equal(scheduler.lastRequest.nodeId, "n2");
  assert.equal(scheduler.lastRequest.workflowId, "wf.offload");
  assert.equal(scheduler.lastRequest.queue, "q.default");

  const r2 = await kit.engine.resumeFromStepResult({
    runId: r1.runId,
    activationId: r1.pending.activationId,
    nodeId: "n2",
    outputs: { main: items([{ ok: true }]) },
  });

  assert.equal(r2.status, "completed");
  assert.equal(events.join(","), "n1,n3"); // n2 was offloaded, so its callback never ran locally
  assert.equal(r2.outputs.length, 1);

  const storedDone = await kit.runStore.load(r1.runId);
  assert.ok(storedDone);
  assert.equal(storedDone.status, "completed");

  // Activation order: n1 (local), n2 (resume result), n3 (local)
  assert.deepEqual(
    kit.activations.map((a: any) => a.nodeId),
    ["n1", "n2", "n3"],
  );
});

