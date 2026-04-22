import assert from "node:assert/strict";
import { test } from "vitest";

import type { ConnectionInvocationRecord, RunCurrentState } from "../../src/index.ts";
import { WorkflowBuilder } from "../../src/index.ts";
import { CallbackNodeConfig, createRegistrarEngineTestKit, items } from "../harness/index.ts";

/**
 * Regression guard (Option A): a rerun must start from a fresh connection-invocation
 * ledger. Before the fix, `RunStartService.createRunCurrentState` deep-copied the
 * prior run's `connectionInvocations` verbatim into the new run's state, which
 * caused `PrismaWorkflowRunRepository.saveOnce` to attempt an insert with a
 * globally-unique `instance_id` that already belonged to the prior run and fail
 * with `Unique constraint failed on the fields: (instance_id)`.
 *
 * Domain rule being guarded: one `ConnectionInvocationRecord` represents a single
 * auditable LLM/tool call and belongs to exactly one run.
 */
test("RunIntentService.rerunFromNode starts the new run with an empty connection-invocation ledger", async () => {
  const n1 = new CallbackNodeConfig("N1", () => {}, { id: "N1" });
  const n2 = new CallbackNodeConfig("N2", () => {}, { id: "N2" });
  const wf = new WorkflowBuilder({
    id: "wf.intent.rerun.connection_invocation_isolation",
    name: "Rerun invocation isolation",
  })
    .start(n1)
    .then(n2)
    .build();

  const kit = createRegistrarEngineTestKit();
  await kit.start([wf]);

  const first = await kit.runIntentStartToCompletion({ wf, startAt: "N1", items: items([{ a: 1 }]) });
  assert.equal(first.status, "completed");

  const firstStored = await kit.runStore.load(first.runId);
  assert.ok(firstStored, "first run should be persisted");

  const priorInvocation: ConnectionInvocationRecord = {
    invocationId: "cinv_prior_run_invocation",
    runId: first.runId,
    workflowId: wf.id,
    connectionNodeId: "llm_slot",
    parentAgentNodeId: "agent_1",
    parentAgentActivationId: "act_1",
    status: "completed",
    managedInput: { prompt: "prior" },
    managedOutput: { text: "reply" },
    queuedAt: "2026-04-18T10:00:01.000Z",
    startedAt: "2026-04-18T10:00:01.000Z",
    finishedAt: "2026-04-18T10:00:02.000Z",
    updatedAt: "2026-04-18T10:00:02.000Z",
  };

  await kit.runStore.save({
    ...firstStored,
    connectionInvocations: [priorInvocation],
  });

  const currentStateCarryingInvocation: RunCurrentState = {
    outputsByNode: firstStored.outputsByNode,
    nodeSnapshotsByNodeId: firstStored.nodeSnapshotsByNodeId,
    mutableState: firstStored.mutableState,
    connectionInvocations: [priorInvocation],
  };

  const second = await kit.runIntent.rerunFromNode({
    workflow: wf,
    nodeId: "N2",
    currentState: currentStateCarryingInvocation,
  });
  const terminal = second.status === "pending" ? await kit.engine.waitForCompletion(second.runId) : second;
  assert.equal(terminal.status, "completed");
  assert.notEqual(terminal.runId, first.runId, "rerun must produce a new runId");

  const secondStored = await kit.runStore.load(terminal.runId);
  assert.ok(secondStored, "second run should be persisted");
  assert.deepEqual(
    secondStored.connectionInvocations ?? [],
    [],
    "new run must not inherit invocations from the prior run",
  );

  const firstReloaded = await kit.runStore.load(first.runId);
  assert.ok(firstReloaded);
  assert.equal(
    firstReloaded.connectionInvocations?.[0]?.invocationId,
    priorInvocation.invocationId,
    "prior run's invocation ledger must remain intact",
  );
});
