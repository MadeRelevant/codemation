import assert from "node:assert/strict";
import { test } from "vitest";

import { EventPublishingWorkflowExecutionRepository, InMemoryRunEventBus } from "../../src/index.ts";
import { InMemoryWorkflowExecutionRepository } from "../../src/bootstrap/index.ts";
import { CallbackNodeConfig, chain, createEngineTestKit, items } from "../harness/index.ts";

test("in-memory run event bus supports workflow-scoped subscriptions", async () => {
  const bus = new InMemoryRunEventBus();
  const seen: string[] = [];

  const subscription = await bus.subscribeToWorkflow("wf.alpha", (event) => {
    seen.push(`${event.kind}:${event.workflowId}`);
  });

  await bus.publish({ kind: "runCreated", runId: "run_1", workflowId: "wf.alpha", at: "2026-03-09T00:00:00.000Z" });
  await bus.publish({ kind: "runCreated", runId: "run_2", workflowId: "wf.beta", at: "2026-03-09T00:00:01.000Z" });

  assert.deepEqual(seen, ["runCreated:wf.alpha"]);
  await subscription.close();
});

test("engine publishes queued, running, and completed node snapshots", async () => {
  const bus = new InMemoryRunEventBus();
  const runStore = new EventPublishingWorkflowExecutionRepository(new InMemoryWorkflowExecutionRepository(), bus);
  const seenKinds: string[] = [];
  let queuedInputs: unknown;
  let completedOutputs: unknown;

  const subscription = await bus.subscribe((event) => {
    seenKinds.push(event.kind);
    if (event.kind === "nodeQueued") queuedInputs = event.snapshot.inputsByPort?.in?.[0]?.json;
    if (event.kind === "nodeCompleted") completedOutputs = event.snapshot.outputs?.main?.[0]?.json;
  });

  const nodeA = new CallbackNodeConfig("A", () => {}, { id: "A" });
  const workflow = chain({ id: "wf.events", name: "events" }).start(nodeA).build();
  const kit = createEngineTestKit({ runStore, eventBus: bus });
  await kit.start([workflow]);

  const result = await kit.runToCompletion({ wf: workflow, startAt: "A", items: items([{ hello: "world" }]) });
  assert.equal(result.status, "completed");

  const nodeKinds = seenKinds.filter(
    (kind) => kind === "nodeQueued" || kind === "nodeStarted" || kind === "nodeCompleted",
  );
  assert.deepEqual(nodeKinds, ["nodeQueued", "nodeStarted", "nodeCompleted"]);
  assert.deepEqual(queuedInputs, { hello: "world" });
  assert.deepEqual(completedOutputs, { hello: "world" });

  const stored = await runStore.load(result.runId);
  assert.equal(stored?.nodeSnapshotsByNodeId.A?.status, "completed");
  await subscription.close();
});
