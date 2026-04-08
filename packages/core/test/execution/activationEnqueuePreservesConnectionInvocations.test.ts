import assert from "node:assert/strict";
import { test } from "vitest";

import { ActivationEnqueueService } from "../../src/execution/ActivationEnqueueService.ts";
import { NodeActivationRequestInputPreparer } from "../../src/execution/NodeActivationRequestInputPreparer.ts";
import { NodeEventPublisher } from "../../src/events/NodeEventPublisher.ts";
import { InMemoryWorkflowExecutionRepository } from "../../src/runStorage/InMemoryWorkflowExecutionRepository.ts";
import { InMemoryRunDataFactory } from "../../src/runStorage/InMemoryRunDataFactory.ts";
import type {
  ConnectionInvocationRecord,
  NodeActivationRequest,
  NodeExecutionContext,
  RunQueuePlanner,
  WorkflowDefinition,
  WorkflowNodeInstanceFactory,
} from "../../src/index.ts";

class StubActivationScheduler {
  async prepareDispatch() {
    return {
      receipt: { receiptId: "receipt_stub" },
      dispatch: async () => undefined,
    };
  }
}

class StubRunQueuePlanner {
  sumItemsByPort(): number {
    return 0;
  }
}

class StubWorkflowNodeInstanceFactory implements WorkflowNodeInstanceFactory {
  createNodes(_workflow: WorkflowDefinition): ReadonlyMap<string, unknown> {
    return new Map();
  }

  createByType(): unknown {
    return {};
  }
}

test("enqueueActivationWithSnapshot keeps existing connection invocation history on the persisted run", async () => {
  const runStore = new InMemoryWorkflowExecutionRepository();
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

  class ActivationEnqueueStubNodeToken {}
  const data = new InMemoryRunDataFactory().create();
  const ctx = {
    data,
    nodeId: "node_after_agent",
    activationId: "act_2",
    config: { kind: "node" as const, type: ActivationEnqueueStubNodeToken },
  } as unknown as NodeExecutionContext;
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
    new NodeActivationRequestInputPreparer(new StubWorkflowNodeInstanceFactory()),
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
