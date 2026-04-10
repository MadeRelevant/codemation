import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod";

import { NodeActivationRequestInputPreparer } from "../../src/execution/NodeActivationRequestInputPreparer.ts";
import { NodeInputContractError } from "../../src/execution/NodeInputContractError.ts";
import type { WorkflowNodeInstanceFactory } from "../../src/index.ts";

class StubFactory implements WorkflowNodeInstanceFactory {
  constructor(private readonly instance: unknown) {
    this.createByType = this.createByType.bind(this);
  }

  createNodes(): ReadonlyMap<string, unknown> {
    return new Map();
  }

  createByType(): unknown {
    return this.instance;
  }
}

test("NodeActivationRequestInputPreparer: validates single-input runnable per item", async () => {
  const preparer = new NodeActivationRequestInputPreparer(
    new StubFactory({
      kind: "node",
      outputPorts: ["main"],
      execute: async () => ({}),
      inputSchema: z.object({ n: z.number() }),
    }),
  );
  const prepared = await preparer.prepare({
    kind: "single",
    runId: "r1",
    activationId: "a1",
    workflowId: "w1",
    nodeId: "n1",
    batchId: "b1",
    input: [{ json: { n: 1 } }],
    ctx: {
      nodeId: "n1",
      activationId: "a1",
      config: { kind: "node", type: class {} },
    } as never,
  });
  assert.equal(prepared.kind, "single");
});

test("NodeActivationRequestInputPreparer: does not rewrite wire item.json when inputSchema coerces/transforms", async () => {
  const preparer = new NodeActivationRequestInputPreparer(
    new StubFactory({
      kind: "node",
      outputPorts: ["main"],
      execute: async () => ({}),
      inputSchema: z.object({ n: z.coerce.number() }).transform(({ n }) => ({ n, doubled: n * 2 })),
    }),
  );
  const wireItem = { json: { n: "21" } };
  const prepared = await preparer.prepare({
    kind: "single",
    runId: "r1",
    activationId: "a1",
    workflowId: "w1",
    nodeId: "n1",
    batchId: "b1",
    input: [wireItem],
    ctx: {
      nodeId: "n1",
      activationId: "a1",
      config: { kind: "node", type: class {} },
    } as never,
  });

  assert.equal(prepared.kind, "single");
  assert.deepEqual(wireItem.json, { n: "21" });
  assert.deepEqual((prepared as { input: Array<{ json: unknown }> }).input[0]?.json, { n: "21" });
});

test("NodeActivationRequestInputPreparer: undefined input normalizes to empty batch for runnable nodes", async () => {
  const preparer = new NodeActivationRequestInputPreparer(
    new StubFactory({
      kind: "node",
      outputPorts: ["main"],
      execute: async () => ({}),
    }),
  );
  const prepared = await preparer.prepare({
    kind: "single",
    runId: "r1",
    activationId: "a1",
    workflowId: "w1",
    nodeId: "n1",
    batchId: "b1",
    input: undefined as unknown as import("../../src/index.ts").Items,
    ctx: {
      nodeId: "n1",
      activationId: "a1",
      config: { kind: "node", type: class {} },
    } as never,
  });
  assert.equal(prepared.kind, "single");
  assert.deepEqual((prepared as { kind: "single"; input: unknown[] }).input, []);
});

test("NodeActivationRequestInputPreparer: schema failure throws NodeInputContractError", async () => {
  const preparer = new NodeActivationRequestInputPreparer(
    new StubFactory({
      kind: "node",
      outputPorts: ["main"],
      execute: async () => ({}),
      inputSchema: z.object({ n: z.number() }),
    }),
  );
  await assert.rejects(
    () =>
      preparer.prepare({
        kind: "single",
        runId: "r1",
        activationId: "a1",
        workflowId: "w1",
        nodeId: "n1",
        batchId: "b1",
        input: [{ json: { bad: true } }],
        ctx: {
          nodeId: "n1",
          activationId: "a1",
          config: { kind: "node", type: class {} },
        } as never,
      }),
    (e) => e instanceof NodeInputContractError,
  );
});

test("NodeActivationRequestInputPreparer: top-level array item.json throws", async () => {
  const preparer = new NodeActivationRequestInputPreparer(
    new StubFactory({
      kind: "node",
      outputPorts: ["main"],
      execute: async () => ({}),
    }),
  );
  await assert.rejects(
    () =>
      preparer.prepare({
        kind: "single",
        runId: "r1",
        activationId: "a1",
        workflowId: "w1",
        nodeId: "n1",
        batchId: "b1",
        input: [{ json: [1, 2] as unknown as never }],
        ctx: {
          nodeId: "n1",
          activationId: "a1",
          config: { kind: "node", type: class {} },
        } as never,
      }),
    (e) => e instanceof NodeInputContractError,
  );
});

test("NodeActivationRequestInputPreparer: multi-input fan-in becomes single runnable and validates each item", async () => {
  const preparer = new NodeActivationRequestInputPreparer(
    new StubFactory({
      kind: "node",
      outputPorts: ["main"],
      execute: async () => ({}),
      inputSchema: z.union([z.object({ x: z.number() }), z.object({ y: z.number() })]),
    }),
  );
  const prepared = await preparer.prepare({
    kind: "multi",
    runId: "r1",
    activationId: "a1",
    workflowId: "w1",
    nodeId: "n1",
    batchId: "b1",
    inputsByPort: {
      B: [{ json: { x: 1 } }],
      C: [{ json: { y: 2 } }],
    },
    ctx: {
      nodeId: "n1",
      activationId: "a1",
      config: { kind: "node", type: class {} },
    } as never,
  });
  assert.equal(prepared.kind, "single");
  assert.equal((prepared as { input: { json: unknown }[] }).input.length, 2);
  assert.deepEqual(
    (prepared as { input: { json: unknown }[] }).input.map((i) => i.json),
    [{ x: 1 }, { y: 2 }],
  );
});

test("NodeActivationRequestInputPreparer: leaves multi-input request when executeMulti exists", async () => {
  const preparer = new NodeActivationRequestInputPreparer(
    new StubFactory({
      kind: "node",
      outputPorts: ["main"],
      executeMulti: async () => ({ main: [] }),
      execute: async () => ({}),
    }),
  );
  const req = {
    kind: "multi" as const,
    runId: "r1",
    activationId: "a1",
    workflowId: "w1",
    nodeId: "n1",
    batchId: "b1",
    inputsByPort: { B: [{ json: { x: 1 } }], C: [{ json: { y: 2 } }] },
    ctx: {
      nodeId: "n1",
      activationId: "a1",
      config: { kind: "node", type: class {} },
    } as never,
  };
  const out = await preparer.prepare(req);
  assert.equal(out.kind, "multi");
});
