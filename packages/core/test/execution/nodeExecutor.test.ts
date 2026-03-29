import assert from "node:assert/strict";
import { test } from "vitest";

import type { MultiInputNode, NodeActivationRequest, NodeResolver, NodeOutputs } from "../../src/index.ts";
import {
  DefaultAsyncSleeper,
  InProcessRetryRunner,
  NodeExecutor,
  NodeInstanceFactory,
} from "../../src/bootstrap/index.ts";

class SuccessfulNode {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(): Promise<NodeOutputs> {
    return { main: [{ json: { ok: true } }] };
  }
}

class SuccessfulMultiNode implements MultiInputNode {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async executeMulti(): Promise<NodeOutputs> {
    return { main: [{ json: { multi: true } }] };
  }
}

class StaticNodeResolver implements NodeResolver {
  constructor(private readonly node: unknown) {}

  resolve<T>(): T {
    return this.node as T;
  }
}

test("node executor runs single-input node activations", async () => {
  const executor = new NodeExecutor(
    new NodeInstanceFactory(new StaticNodeResolver(new SuccessfulNode())),
    new InProcessRetryRunner(new DefaultAsyncSleeper()),
  );
  const result = await executor.execute({
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
  } satisfies NodeActivationRequest);

  assert.deepEqual(result, { main: [{ json: { ok: true } }] });
});

test("node executor runs multi-input node activations", async () => {
  const executor = new NodeExecutor(
    new NodeInstanceFactory(new StaticNodeResolver(new SuccessfulMultiNode())),
    new InProcessRetryRunner(new DefaultAsyncSleeper()),
  );
  const result = await executor.execute({
    kind: "multi",
    runId: "run_1",
    activationId: "act_1",
    workflowId: "wf_1",
    nodeId: "node_1",
    inputsByPort: { left: [], right: [] },
    ctx: {
      runId: "run_1",
      workflowId: "wf_1",
      nodeId: "node_1",
      activationId: "act_1",
      config: { type: "test.node" },
      data: {} as never,
    },
  } satisfies NodeActivationRequest);

  assert.deepEqual(result, { main: [{ json: { multi: true } }] });
});
