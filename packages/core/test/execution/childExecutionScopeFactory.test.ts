import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  ActivationIdFactory,
  ConnectionInvocationId,
  NodeExecutionContext,
  NodeId,
  RunnableNodeConfig,
  TelemetrySpanScope,
  TypeToken,
} from "../../src/index.ts";

import { ChildExecutionScopeFactory } from "../../src/execution/ChildExecutionScopeFactory.ts";

class StubActivationIdFactory implements ActivationIdFactory {
  private nextId = 0;
  makeActivationId(): string {
    return `act_${++this.nextId}`;
  }
}

const NODE_TYPE_TOKEN: TypeToken<unknown> = Symbol.for("ChildExecutionScopeFactoryTest.Node") as TypeToken<unknown>;

interface StubConfig extends RunnableNodeConfig<unknown, unknown> {
  readonly kind: "node";
}

function makeParentCtx(): NodeExecutionContext<StubConfig> {
  return {
    runId: "run_parent",
    workflowId: "wf_parent",
    nodeId: "parent_node",
    activationId: "act_parent",
    parent: undefined,
    subworkflowDepth: 0,
    engineMaxNodeActivations: 100,
    engineMaxSubworkflowDepth: 8,
    iterationId: "iter_parent",
    itemIndex: 0,
    now: () => new Date("2026-05-03T12:00:00.000Z"),
    data: { getOutputs: () => undefined, getOutputItems: () => [], getOutputItem: () => undefined },
    telemetry: {} as never,
    binary: {
      forNode: (args: { nodeId: NodeId; activationId: string }) =>
        ({
          scopedNodeId: args.nodeId,
          scopedActivationId: args.activationId,
        }) as never,
      openReadStream: async () => undefined,
    } as never,
    getCredential: async () => {
      throw new Error("unused");
    },
    config: { kind: "node", type: NODE_TYPE_TOKEN } as StubConfig,
  };
}

function makeParentSpan(): TelemetrySpanScope {
  return {
    asNodeTelemetry: (args: { nodeId: NodeId; activationId: string }) =>
      ({
        scopedNodeId: args.nodeId,
        scopedActivationId: args.activationId,
      }) as never,
  } as never;
}

test("ChildExecutionScopeFactory.forSubAgent re-roots nodeId/activationId, refreshes binary + telemetry, and clears iterationId", () => {
  const factory = new ChildExecutionScopeFactory(new StubActivationIdFactory());
  const parentCtx = makeParentCtx();
  const childCtx = factory.forSubAgent<StubConfig>({
    parentCtx,
    childNodeId: "child_node" as NodeId,
    childConfig: { kind: "node", type: NODE_TYPE_TOKEN } as StubConfig,
    parentInvocationId: "ci_parent" as ConnectionInvocationId,
    parentSpan: makeParentSpan(),
  });

  assert.equal(childCtx.nodeId, "child_node");
  assert.equal(childCtx.activationId, "act_1", "fresh activation id from the factory");
  assert.equal(childCtx.parentInvocationId, "ci_parent");
  assert.equal(childCtx.iterationId, undefined, "iterationId is cleared so child loops don't inherit parent identity");
  // Binary + telemetry should be re-scoped to the new (nodeId, activationId).
  assert.deepEqual(childCtx.binary, { scopedNodeId: "child_node", scopedActivationId: "act_1" });
  assert.deepEqual(childCtx.telemetry, { scopedNodeId: "child_node", scopedActivationId: "act_1" });
  // Inherited fields stay (runId, workflowId, parent run policy caps).
  assert.equal(childCtx.runId, "run_parent");
  assert.equal(childCtx.workflowId, "wf_parent");
  assert.equal(childCtx.engineMaxNodeActivations, 100);
});

test("ChildExecutionScopeFactory mints a fresh activation id on each call", () => {
  const factory = new ChildExecutionScopeFactory(new StubActivationIdFactory());
  const parentCtx = makeParentCtx();
  const a = factory.forSubAgent<StubConfig>({
    parentCtx,
    childNodeId: "child_a" as NodeId,
    childConfig: parentCtx.config,
    parentInvocationId: "ci_a" as ConnectionInvocationId,
    parentSpan: makeParentSpan(),
  });
  const b = factory.forSubAgent<StubConfig>({
    parentCtx,
    childNodeId: "child_b" as NodeId,
    childConfig: parentCtx.config,
    parentInvocationId: "ci_b" as ConnectionInvocationId,
    parentSpan: makeParentSpan(),
  });
  assert.notEqual(a.activationId, b.activationId);
});
