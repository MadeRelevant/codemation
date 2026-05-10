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

class FailingNode {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(): Promise<never> {
    throw new Error("node execution failed");
  }
}

class ErrorCapturingContinuation implements NodeActivationContinuation {
  capturedError: Error | null = null;

  async markNodeRunning(): Promise<void> {}

  async resumeFromNodeResult(): Promise<void> {}

  async resumeFromNodeError(args: Readonly<{ error: Error }>): Promise<void> {
    this.capturedError = args.error;
  }
}

class ErrorThrowingContinuation implements NodeActivationContinuation {
  async markNodeRunning(): Promise<void> {}

  async resumeFromNodeResult(): Promise<never> {
    throw new Error("unexpected call");
  }

  async resumeFromNodeError(): Promise<never> {
    throw new Error("fatal continuation error");
  }
}

class IgnorableErrorContinuation implements NodeActivationContinuation {
  async markNodeRunning(): Promise<void> {}

  async resumeFromNodeResult(): Promise<never> {
    throw new Error("unexpected call");
  }

  async resumeFromNodeError(): Promise<never> {
    throw new Error("run is not pending");
  }
}

function makeRequest(): NodeActivationRequest {
  return {
    kind: "single",
    runId: "run_1",
    activationId: "act_1",
    workflowId: "wf_1",
    nodeId: "node_1",
    input: [{ json: {} }],
    ctx: {
      runId: "run_1",
      workflowId: "wf_1",
      nodeId: "node_1",
      activationId: "act_1",
      config: { type: "test.node" },
      data: {} as never,
    },
  };
}

test("inline scheduler routes node execution errors through resumeAfterExecutionError", async () => {
  const continuation = new ErrorCapturingContinuation();
  const scheduler = new InlineDrivingScheduler(
    new NodeExecutor(
      new NodeInstanceFactory(new StaticNodeResolver(new FailingNode())),
      new InProcessRetryRunner(new DefaultAsyncSleeper()),
    ),
  );
  scheduler.setContinuation(continuation);

  const prepared = await scheduler.prepareDispatch(makeRequest());
  await prepared.dispatch();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.ok(continuation.capturedError instanceof Error);
  assert.equal(continuation.capturedError.message, "node execution failed");
});

test("inline scheduler rethrows non-ignorable errors from resumeFromNodeError", async () => {
  // Capture the unhandled rejection that drainRun emits when continuation.resumeFromNodeError
  // throws a non-ignorable error (i.e. not "is not pending" / "mismatch").
  let capturedRejection: Error | null = null;
  const handler = (reason: unknown) => {
    if (reason instanceof Error && reason.message === "fatal continuation error") {
      capturedRejection = reason;
    }
  };
  process.on("unhandledRejection", handler);

  const scheduler = new InlineDrivingScheduler(
    new NodeExecutor(
      new NodeInstanceFactory(new StaticNodeResolver(new FailingNode())),
      new InProcessRetryRunner(new DefaultAsyncSleeper()),
    ),
  );
  scheduler.setContinuation(new ErrorThrowingContinuation());

  const prepared = await scheduler.prepareDispatch(makeRequest());
  await prepared.dispatch();
  await new Promise((resolve) => setTimeout(resolve, 50));
  process.off("unhandledRejection", handler);

  assert.ok(capturedRejection instanceof Error, "expected non-ignorable error to be rethrown as unhandled rejection");
  assert.equal((capturedRejection as Error).message, "fatal continuation error");
});

test("inline scheduler silently ignores ignorable continuation errors after execution error", async () => {
  const scheduler = new InlineDrivingScheduler(
    new NodeExecutor(
      new NodeInstanceFactory(new StaticNodeResolver(new FailingNode())),
      new InProcessRetryRunner(new DefaultAsyncSleeper()),
    ),
  );
  scheduler.setContinuation(new IgnorableErrorContinuation());

  const prepared = await scheduler.prepareDispatch(makeRequest());
  await prepared.dispatch();

  // No unhandled rejection — ignorable errors are swallowed.
  await new Promise((resolve) => setTimeout(resolve, 20));
});

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
