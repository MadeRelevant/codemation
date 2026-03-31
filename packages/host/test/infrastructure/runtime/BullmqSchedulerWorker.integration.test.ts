import "reflect-metadata";

import type {
  NodeActivationContinuation,
  NodeActivationId,
  NodeResolver,
  RunId,
  RunResult,
  TypeToken,
  WorkflowExecutionRepository,
  WorkflowId,
} from "@codemation/core";
import { InMemoryWorkflowExecutionRepository } from "@codemation/core/bootstrap";
import { Callback, CallbackNode, createWorkflowBuilder, ManualTrigger } from "@codemation/core-nodes";
import { RejectingCredentialSessionService } from "@codemation/core/testing";
import { afterEach, describe, expect, it } from "vitest";

import { BullmqNodeExecutionScheduler } from "../../../src/infrastructure/runtime/BullmqNodeExecutionScheduler";
import { BullmqWorker } from "../../../src/infrastructure/runtime/BullmqWorker";

const redisUrl = process.env.REDIS_URL?.trim();

let bullmqQueuePrefixSequence = 0;

class CallbackOnlyNodeResolver implements NodeResolver {
  resolve<T>(token: TypeToken<unknown>): T {
    if (token === CallbackNode) {
      return new CallbackNode() as T;
    }
    throw new Error(`Unexpected node token: ${String(token)}`);
  }
}

class OutcomeRecordingContinuation implements NodeActivationContinuation {
  readonly completed: Array<Parameters<NodeActivationContinuation["resumeFromNodeResult"]>[0]> = [];

  constructor(private readonly repository: WorkflowExecutionRepository) {}

  async markNodeRunning(_args: Parameters<NodeActivationContinuation["markNodeRunning"]>[0]): Promise<void> {}

  async resumeFromNodeResult(
    args: Parameters<NodeActivationContinuation["resumeFromNodeResult"]>[0],
  ): Promise<RunResult> {
    this.completed.push(args);
    const state = await this.repository.load(args.runId);
    if (!state) {
      throw new Error(`Missing run ${args.runId}`);
    }
    return {
      runId: args.runId,
      workflowId: state.workflowId,
      startedAt: state.startedAt,
      status: "completed",
      outputs: [],
    };
  }

  async resumeFromNodeError(
    args: Parameters<NodeActivationContinuation["resumeFromNodeError"]>[0],
  ): Promise<RunResult> {
    const state = await this.repository.load(args.runId);
    if (!state) {
      throw new Error(`Missing run ${args.runId}`);
    }
    return {
      runId: args.runId,
      workflowId: state.workflowId,
      startedAt: state.startedAt,
      status: "failed",
      error: { message: args.error.message },
    };
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
    const repository = new InMemoryWorkflowExecutionRepository();
    const continuation = new OutcomeRecordingContinuation(repository);
    const workflow = createWorkflowBuilder({ id: "wf-bullmq-it", name: "bullmq-it" })
      .trigger(new ManualTrigger("Manual", "tr"))
      .then(new Callback("n1", undefined, "n1"))
      .build();
    const workflowsById = new Map<WorkflowId, typeof workflow>([[workflow.id, workflow]]);

    const runId = "run-bullmq-it" as RunId;
    const workflowId = workflow.id as WorkflowId;
    await repository.createRun({
      runId,
      workflowId,
      startedAt: "2025-01-01T00:00:00.000Z",
    });

    worker = new BullmqWorker(
      connection,
      ["default"],
      workflowsById,
      new CallbackOnlyNodeResolver(),
      new RejectingCredentialSessionService(),
      repository,
      continuation,
      queuePrefix,
    );
    await worker.waitUntilReady();

    scheduler = new BullmqNodeExecutionScheduler(connection, queuePrefix);
    await scheduler.enqueue({
      runId,
      activationId: "act-bullmq-it" as NodeActivationId,
      workflowId,
      nodeId: "n1",
      input: [{ json: { ok: true } }],
    });

    for (let attempt = 0; attempt < 2400 && continuation.completed.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    expect(continuation.completed.length).toBe(1);
    expect(continuation.completed[0]?.outputs).toEqual({ main: [{ json: { ok: true } }] });
  });
});
