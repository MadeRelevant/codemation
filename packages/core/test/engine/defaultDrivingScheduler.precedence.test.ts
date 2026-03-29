import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  NodeActivationContinuation,
  NodeActivationRequest,
  NodeExecutionRequest,
  NodeExecutionScheduler,
  NodeOffloadPolicy,
} from "../../src/index.ts";
import { DefaultDrivingScheduler } from "../../src/execution/index.ts";

class RecordingWorkerScheduler implements NodeExecutionScheduler {
  readonly requests: NodeExecutionRequest[] = [];

  async enqueue(request: NodeExecutionRequest): Promise<{ receiptId: string }> {
    this.requests.push(request);
    return { receiptId: `worker_${this.requests.length}` };
  }
}

class RecordingInlineScheduler {
  readonly requests: NodeActivationRequest[] = [];

  setContinuation(_continuation: NodeActivationContinuation): void {}

  async enqueue(request: NodeActivationRequest): Promise<{ receiptId: string; mode: "local" }> {
    this.requests.push(request);
    return { receiptId: `inline_${this.requests.length}`, mode: "local" };
  }

  notifyPendingStatePersisted(_runId: string): void {}
}

class ConfigAwareOffloadPolicy implements NodeOffloadPolicy {
  constructor(private readonly defaultMode: "local" | "worker") {}

  decide(args: Parameters<NodeOffloadPolicy["decide"]>[0]) {
    if (args.config.execution?.hint === "worker") {
      return { mode: "worker" as const, queue: args.config.execution.queue };
    }
    if (args.config.execution?.hint === "local") {
      return { mode: "local" as const };
    }
    return { mode: this.defaultMode };
  }
}

class DefaultDrivingSchedulerRequestFactory {
  static create(args?: {
    localOnly?: boolean;
    execution?: { hint?: "local" | "worker"; queue?: string };
  }): NodeActivationRequest {
    return {
      kind: "single",
      runId: "run_1",
      activationId: "act_1",
      workflowId: "wf_1",
      nodeId: "node_1",
      input: [],
      executionOptions: args?.localOnly ? { localOnly: true } : undefined,
      ctx: {
        config: {
          kind: "node",
          type: class TestNode {},
          ...(args?.execution === undefined ? {} : { execution: args.execution }),
        },
      } as NodeActivationRequest["ctx"],
    };
  }
}

test("run-intent localOnly override wins over worker node hints", async () => {
  const worker = new RecordingWorkerScheduler();
  const inline = new RecordingInlineScheduler();
  const scheduler = new DefaultDrivingScheduler(new ConfigAwareOffloadPolicy("worker"), worker, inline as never);

  const receipt = await scheduler.enqueue(
    DefaultDrivingSchedulerRequestFactory.create({
      localOnly: true,
      execution: { hint: "worker", queue: "q.jobs" },
    }),
  );

  assert.equal(receipt.mode, "local");
  assert.equal(inline.requests.length, 1);
  assert.equal(worker.requests.length, 0);
});

test("node-level execution hints route through the worker scheduler when no override is present", async () => {
  const worker = new RecordingWorkerScheduler();
  const inline = new RecordingInlineScheduler();
  const scheduler = new DefaultDrivingScheduler(new ConfigAwareOffloadPolicy("local"), worker, inline as never);

  const receipt = await scheduler.enqueue(
    DefaultDrivingSchedulerRequestFactory.create({
      execution: { hint: "worker", queue: "q.hinted" },
    }),
  );

  assert.equal(receipt.mode, "worker");
  assert.equal(receipt.queue, "q.hinted");
  assert.equal(worker.requests.length, 1);
  assert.equal(inline.requests.length, 0);
});

test("container-default scheduler policy applies when neither override nor node hint is present", async () => {
  const worker = new RecordingWorkerScheduler();
  const inline = new RecordingInlineScheduler();
  const scheduler = new DefaultDrivingScheduler(new ConfigAwareOffloadPolicy("worker"), worker, inline as never);

  const receipt = await scheduler.enqueue(DefaultDrivingSchedulerRequestFactory.create());

  assert.equal(receipt.mode, "worker");
  assert.equal(worker.requests.length, 1);
  assert.equal(inline.requests.length, 0);
});
