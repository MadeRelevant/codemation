import assert from "node:assert/strict";
import { test } from "vitest";

import { ActivationEnqueueService } from "../src/engine/application/execution/ActivationEnqueueService.ts";
import { NodeEventPublisher } from "../src/engine/application/events/NodeEventPublisher.ts";
import { InMemoryRunDataFactory } from "../src/engine/storage/inMemoryRunDataFactory.ts";
import { InMemoryRunStateStore } from "../src/engine/storage/inMemoryRunStateStore.ts";
import type {
  ConnectionInvocationRecord,
  NodeActivationRequest,
  NodeExecutionContext,
  RunQueuePlanner,
} from "../src/index.ts";

class StubActivationScheduler {
  async enqueue(): Promise<{ receiptId: string }> {
    return { receiptId: "receipt_stub" };
  }
}

class StubRunQueuePlanner {
  sumItemsByPort(): number {
    return 0;
  }
}

test("enqueueActivationWithSnapshot keeps existing connection invocation history on the persisted run", async () => {
  const runStore = new InMemoryRunStateStore();
  await runStore.createRun({
    runId: "run_1",
    workflowId: "wf_1",
    startedAt: "2026-01-01T00:00:00.000Z",
    engineCounters: { completedNodeActivations: 0 },
  });
  const loaded = await runStore.load("run_1");
  assert.ok(loaded);
  const prior: ConnectionInvocationRecord = {
    invocationId: "cinv_llm_first",
    runId: "run_1",
    workflowId: "wf_1",
    connectionNodeId: "agent__conn__llm",
    parentAgentNodeId: "agent",
    parentAgentActivationId: "act_1",
    status: "completed",
    updatedAt: "2026-01-01T00:00:05.000Z",
  };
  await runStore.save({
    ...loaded,
    connectionInvocations: [prior],
  });

  const data = new InMemoryRunDataFactory().create();
  const ctx = { data } as unknown as NodeExecutionContext;
  const request = {
    kind: "single" as const,
    runId: "run_1",
    activationId: "act_2",
    workflowId: "wf_1",
    nodeId: "node_after_agent",
    batchId: "batch_1",
    input: [{ json: {} }],
    ctx,
  } satisfies NodeActivationRequest;

  const service = new ActivationEnqueueService(
    new StubActivationScheduler(),
    runStore,
    new NodeEventPublisher(undefined),
  );

  await service.enqueueActivationWithSnapshot({
    runId: "run_1",
    workflowId: "wf_1",
    startedAt: loaded.startedAt,
    control: undefined,
    workflowSnapshot: loaded.workflowSnapshot,
    mutableState: loaded.mutableState,
    policySnapshot: loaded.policySnapshot,
    pendingQueue: [],
    request,
    previousNodeSnapshotsByNodeId: {},
    planner: new StubRunQueuePlanner() as unknown as RunQueuePlanner,
    connectionInvocations: [prior],
  });

  const after = await runStore.load("run_1");
  assert.ok(after?.connectionInvocations);
  assert.equal(after.connectionInvocations.length, 1);
  assert.equal(after.connectionInvocations[0]?.invocationId, "cinv_llm_first");
});
