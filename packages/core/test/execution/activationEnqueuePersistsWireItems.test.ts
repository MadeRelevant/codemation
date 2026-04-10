import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod";

import { ActivationEnqueueService } from "../../src/execution/ActivationEnqueueService.ts";
import { NodeActivationRequestInputPreparer } from "../../src/execution/NodeActivationRequestInputPreparer.ts";
import { NodeEventPublisher } from "../../src/events/NodeEventPublisher.ts";
import { InMemoryWorkflowExecutionRepository } from "../../src/runStorage/InMemoryWorkflowExecutionRepository.ts";
import { InMemoryRunDataFactory } from "../../src/runStorage/InMemoryRunDataFactory.ts";
import type {
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

class InputSchemaRunnableInstance {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;
  readonly inputSchema = z.object({ n: z.coerce.number() }).transform(({ n }) => ({ n, doubled: n * 2 }));

  async execute(): Promise<unknown> {
    return {};
  }
}

class InputSchemaWorkflowNodeInstanceFactory implements WorkflowNodeInstanceFactory {
  createNodes(_workflow: WorkflowDefinition): ReadonlyMap<string, unknown> {
    return new Map();
  }

  createByType(): unknown {
    return new InputSchemaRunnableInstance();
  }
}

test("enqueueActivationWithSnapshot persists wire items (does not overwrite item.json with parsed input)", async () => {
  const runStore = new InMemoryWorkflowExecutionRepository();
  await runStore.createRun({
    runId: "run_1",
    workflowId: "wf_1",
    startedAt: "2026-01-01T00:00:00.000Z",
    engineCounters: { completedNodeActivations: 0 },
  });
  const loaded = await runStore.load("run_1");
  assert.ok(loaded);

  class StubNodeToken {}
  const data = new InMemoryRunDataFactory().create();
  const ctx = {
    data,
    nodeId: "node_1",
    activationId: "act_1",
    config: { kind: "node" as const, type: StubNodeToken },
  } as unknown as NodeExecutionContext;

  const request = {
    kind: "single" as const,
    runId: "run_1",
    activationId: "act_1",
    workflowId: "wf_1",
    nodeId: "node_1",
    batchId: "batch_1",
    input: [{ json: { n: "21" } }],
    ctx,
  } satisfies NodeActivationRequest;

  const service = new ActivationEnqueueService(
    new StubActivationScheduler(),
    runStore,
    new NodeEventPublisher(undefined),
    new NodeActivationRequestInputPreparer(new InputSchemaWorkflowNodeInstanceFactory()),
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
    connectionInvocations: [],
  });

  const after = await runStore.load("run_1");
  assert.ok(after?.pending?.inputsByPort?.in);
  assert.deepEqual(after.pending.inputsByPort.in[0]?.json, { n: "21" });

  const snap = after.nodeSnapshotsByNodeId?.node_1;
  assert.ok(snap?.inputsByPort?.in);
  assert.deepEqual(snap.inputsByPort.in[0]?.json, { n: "21" });
});
