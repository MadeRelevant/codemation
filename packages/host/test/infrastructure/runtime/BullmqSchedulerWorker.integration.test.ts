import "reflect-metadata";

import type {
  NodeActivationId,
  NodeExecutionRequest,
  NodeExecutionRequestHandler,
  RunId,
  WorkflowId,
} from "@codemation/core";
import { afterEach, describe, expect, it } from "vitest";

import { BullmqNodeExecutionScheduler } from "../../../src/infrastructure/scheduler/bullmq/BullmqNodeExecutionScheduler";
import { BullmqWorker } from "../../../src/infrastructure/scheduler/bullmq/BullmqWorker";

const redisUrl = process.env.REDIS_URL?.trim();

let bullmqQueuePrefixSequence = 0;

class RecordingNodeExecutionRequestHandler implements NodeExecutionRequestHandler {
  readonly handled: NodeExecutionRequest[] = [];

  async handleNodeExecutionRequest(request: NodeExecutionRequest): Promise<void> {
    this.handled.push(request);
  }
}

describe.skipIf(!redisUrl)("BullMQ scheduler + worker (Redis)", () => {
  let scheduler: BullmqNodeExecutionScheduler | null = null;
  let worker: BullmqWorker | null = null;

  afterEach(async () => {
    await scheduler?.close();
    scheduler = null;
    await worker?.stop();
    worker = null;
  });

  it("enqueues a node job and the worker executes CallbackNode end-to-end", async () => {
    const queuePrefix = `cm-it-${process.pid}-${bullmqQueuePrefixSequence}`;
    bullmqQueuePrefixSequence += 1;

    const connection = { url: redisUrl! };
    const requestHandler = new RecordingNodeExecutionRequestHandler();

    const runId = "run-bullmq-it" as RunId;
    const workflowId = "wf-bullmq-it" as WorkflowId;

    worker = new BullmqWorker(connection, ["default"], queuePrefix, requestHandler);
    await worker.waitUntilReady();

    scheduler = new BullmqNodeExecutionScheduler(connection, queuePrefix);
    await scheduler.enqueue({
      runId,
      activationId: "act-bullmq-it" as NodeActivationId,
      workflowId,
      nodeId: "n1",
      input: [{ json: { ok: true } }],
    });

    for (let attempt = 0; attempt < 2400 && requestHandler.handled.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    expect(requestHandler.handled).toEqual([
      {
        runId,
        activationId: "act-bullmq-it",
        workflowId,
        nodeId: "n1",
        input: [{ json: { ok: true } }],
      },
    ]);
  });
});
