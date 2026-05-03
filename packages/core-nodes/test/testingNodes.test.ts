import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "vitest";

import type { AssertionResult, NodeExecutionContext, RunnableNodeExecuteArgs } from "@codemation/core";
import {
  DefaultExecutionBinaryService,
  InMemoryBinaryStorage,
  InMemoryRunDataFactory,
} from "@codemation/core/bootstrap";

import { Assertion, AssertionNode } from "../src/nodes/assertion.ts";
import { IsTestRun, IsTestRunNode } from "../src/nodes/isTestRun.ts";
import { TestTrigger, TestTriggerNode } from "../src/nodes/testTrigger.ts";

class TestNodeContextFactory {
  static create<TConfig>(
    config: TConfig,
    options?: { withTestContext?: boolean },
  ): NodeExecutionContext<TConfig & object> {
    const binary = new DefaultExecutionBinaryService(
      new InMemoryBinaryStorage(),
      "wf.test",
      "run_test",
      () => new Date("2026-05-02T12:00:00.000Z"),
    );
    const ctx: NodeExecutionContext<TConfig & object> = {
      runId: "run_test",
      workflowId: "wf.test",
      nodeId: "n",
      activationId: "a",
      now: () => new Date("2026-05-02T12:00:00.000Z"),
      data: new InMemoryRunDataFactory().create(),
      parent: undefined,
      subworkflowDepth: 0,
      engineMaxNodeActivations: 100,
      engineMaxSubworkflowDepth: 8,
      binary: binary.forNode({ nodeId: "n", activationId: "a" }),
      telemetry: {
        forNode: () => ({}) as never,
      } as never,
      getCredential: async () => {
        throw new Error("unused");
      },
      config: config as TConfig & object,
    };
    if (options?.withTestContext) {
      return { ...ctx, testContext: { testSuiteRunId: "tsr_x", testCaseIndex: 0 } };
    }
    return ctx;
  }
}

test("TestTriggerNode passes incoming items through on `main`", async () => {
  const node = new TestTriggerNode();
  const config = new TestTrigger<{ idx: number }>({
    name: "fixtures",
    async *generateItems() {
      yield { json: { idx: 0 } };
    },
  });
  const ctx = TestNodeContextFactory.create(config);
  const outputs = await node.execute([{ json: { idx: 7 } as never }], ctx);
  assert.deepEqual(
    outputs.main?.map((i) => i.json),
    [{ idx: 7 }],
  );
});

test("TestTrigger marks itself as triggerKind='test' so live activation skips it", () => {
  const config = new TestTrigger({ async *generateItems() {} });
  assert.equal(config.kind, "trigger");
  assert.equal(config.triggerKind, "test");
});

test("IsTestRunNode routes to `true` port when ctx.testContext is set", () => {
  const node = new IsTestRunNode();
  const config = new IsTestRun();
  const item = { json: { x: 1 } };
  const ctx = TestNodeContextFactory.create(config, { withTestContext: true });
  const args: RunnableNodeExecuteArgs<IsTestRun> = {
    input: item.json,
    item,
    itemIndex: 0,
    items: [item],
    ctx,
  };
  const emission = node.execute(args) as { ports: Record<string, ReadonlyArray<unknown>> };
  assert.equal(emission.ports.true!.length, 1);
  assert.equal(emission.ports.false!.length, 0);
});

test("IsTestRunNode routes to `false` port when ctx.testContext is absent", () => {
  const node = new IsTestRunNode();
  const config = new IsTestRun();
  const item = { json: { x: 1 } };
  const ctx = TestNodeContextFactory.create(config);
  const args: RunnableNodeExecuteArgs<IsTestRun> = {
    input: item.json,
    item,
    itemIndex: 0,
    items: [item],
    ctx,
  };
  const emission = node.execute(args) as { ports: Record<string, ReadonlyArray<unknown>> };
  assert.equal(emission.ports.true!.length, 0);
  assert.equal(emission.ports.false!.length, 1);
});

test("AssertionNode emits one item per AssertionResult on `main`", async () => {
  const node = new AssertionNode();
  const config = new Assertion<{ value: number }>({
    name: "checks",
    assertions: (item): ReadonlyArray<AssertionResult> => [
      { name: "positive", score: item.json.value > 0 ? 1 : 0, expected: ">0", actual: item.json.value },
      { name: "is integer", score: Number.isInteger(item.json.value) ? 1 : 0 },
    ],
  });
  const ctx = TestNodeContextFactory.create(config);
  const item = { json: { value: 3 } };
  const args: RunnableNodeExecuteArgs<Assertion<{ value: number }>, { value: number }> = {
    input: item.json,
    item,
    itemIndex: 0,
    items: [item],
    ctx,
  };
  // AssertionNode returns the bare AssertionResult array; the engine wraps each as an Item with
  // `json: result` for downstream nodes (and the host persister reads `item.json` accordingly).
  const result = (await node.execute(args)) as ReadonlyArray<AssertionResult>;
  assert.equal(result.length, 2);
  assert.equal(result[0]!.name, "positive");
  assert.equal(result[0]!.score, 1);
  assert.equal(result[1]!.name, "is integer");
  assert.equal(result[1]!.score, 1);
});

test("AssertionNode emits a single errored result when the author callback throws", async () => {
  const node = new AssertionNode();
  const config = new Assertion<{ value: number }>({
    name: "throws-asserter",
    assertions: () => {
      throw new Error("judge call failed");
    },
  });
  const ctx = TestNodeContextFactory.create(config);
  const item = { json: { value: 1 } };
  const args: RunnableNodeExecuteArgs<Assertion<{ value: number }>, { value: number }> = {
    input: item.json,
    item,
    itemIndex: 0,
    items: [item],
    ctx,
  };
  const result = (await node.execute(args)) as ReadonlyArray<AssertionResult>;
  assert.equal(result.length, 1);
  assert.equal(result[0]!.name, "throws-asserter");
  assert.equal(result[0]!.score, 0);
  assert.equal(result[0]!.errored, true);
  assert.equal(result[0]!.message, "judge call failed");
});

test("Assertion config sets emitsAssertions=true so host persisters can identify it", () => {
  const config = new Assertion({ assertions: () => [] });
  assert.equal(config.emitsAssertions, true);
});
