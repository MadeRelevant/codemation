import assert from "node:assert/strict";
import { test } from "vitest";

import { type NodeActivationContinuation, type NodeActivationRequest, type NodeResolver } from "../../src/index.ts";
import {
  DefaultAsyncSleeper,
  InProcessRetryRunner,
  InlineDrivingScheduler,
  NodeExecutor,
  NodeInstanceFactory,
} from "../../src/bootstrap/index.ts";

class SuccessfulNode {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(): Promise<Readonly<Record<string, ReadonlyArray<never>>>> {
    return { main: [] };
  }
}

class StaticNodeResolver implements NodeResolver {
  constructor(private readonly node: unknown) {}

  resolve<T>(): T {
    return this.node as T;
  }
}

class StaleResultContinuation implements NodeActivationContinuation {
  resumeFromNodeResultCalls = 0;
  resumeFromNodeErrorCalls = 0;

  async markNodeRunning(): Promise<void> {}

  async resumeFromNodeResult(): Promise<never> {
    this.resumeFromNodeResultCalls += 1;
    throw new Error("Run run_1 is not pending");
  }

  async resumeFromNodeError(): Promise<never> {
    this.resumeFromNodeErrorCalls += 1;
    throw new Error("resumeFromNodeError should not run after a stale result continuation error");
  }
}

test("inline scheduler ignores stale continuation races after a node already finished", async () => {
  const continuation = new StaleResultContinuation();
  const scheduler = new InlineDrivingScheduler(
    new NodeExecutor(
      new NodeInstanceFactory(new StaticNodeResolver(new SuccessfulNode())),
      new InProcessRetryRunner(new DefaultAsyncSleeper()),
    ),
  );
  scheduler.setContinuation(continuation);

  const request: NodeActivationRequest = {
    kind: "single",
    runId: "run_1",
    activationId: "act_1",
    workflowId: "wf_1",
    nodeId: "node_1",
    input: [],
    ctx: {
      runId: "run_1",
      workflowId: "wf_1",
      nodeId: "node_1",
      activationId: "act_1",
      config: { type: "test.node" },
      data: {} as never,
    },
  };

  const prepared = await scheduler.prepareDispatch(request);
  await prepared.dispatch();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(continuation.resumeFromNodeResultCalls, 1);
  assert.equal(continuation.resumeFromNodeErrorCalls, 0);
});
