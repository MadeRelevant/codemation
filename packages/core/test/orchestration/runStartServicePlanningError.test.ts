import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Items,
  NodeExecutionContext,
  NodeOutputs,
  TriggerNode,
  TriggerNodeConfig,
  TriggerSetupContext,
  TypeToken,
} from "../../src/index.ts";
import { WorkflowBuilder, injectable } from "../../src/index.ts";

import { CallbackNodeConfig, createEngineTestKit, dag, items } from "../harness/index.ts";

class ManualTestTriggerConfig implements TriggerNodeConfig<unknown> {
  readonly kind = "trigger" as const;
  readonly type: TypeToken<unknown> = ManualTestTriggerNode;
  readonly continueWhenEmptyOutput = true as const;

  constructor(
    public readonly name: string,
    public readonly id: string,
  ) {}
}

class ManualTestTriggerNode implements TriggerNode<ManualTestTriggerConfig> {
  readonly kind = "trigger" as const;
  readonly outputPorts = ["main"] as const;

  async setup(_ctx: TriggerSetupContext<ManualTestTriggerConfig>): Promise<undefined> {
    return undefined;
  }

  async execute(items: Items, _ctx: NodeExecutionContext<ManualTestTriggerConfig>): Promise<NodeOutputs> {
    return { main: items };
  }
}

@injectable()
class FailingPlanningNode {
  constructor() {
    throw new Error("simulated planning failure");
  }
}

class FailingPlanningNodeConfig {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = FailingPlanningNode;

  constructor(
    public readonly name: string,
    public readonly id: string,
  ) {}
}

test("runWorkflowFromState records a failed run when planning throws NodeInstantiationError", async () => {
  const trigger = new ManualTestTriggerConfig("Manual trigger", "trigger");
  const failing = new FailingPlanningNodeConfig("failing", "failing");
  const workflow = new WorkflowBuilder({ id: "wf.planning.fail.fromState", name: "Planning fail from state" })
    .trigger(trigger)
    .then(failing)
    .build();

  const kit = createEngineTestKit();
  await kit.start([workflow]);

  const result = await kit.engine.runWorkflowFromState({
    workflow,
    items: [],
    stopCondition: { kind: "workflowCompleted" },
  });

  assert.equal(result.status, "failed");
  assert.match(result.error?.message ?? "", /simulated planning failure/);

  const stored = await kit.runStore.load(result.runId);
  assert.equal(stored?.status, "failed");
  const snapshot = stored?.nodeSnapshotsByNodeId["failing"];
  assert.equal(snapshot?.status, "failed");
  assert.equal(snapshot?.error?.name, "NodeInstantiationError");
  assert.match(snapshot?.error?.message ?? "", /simulated planning failure/);
});

test("runWorkflow records a failed run when planning throws NodeInstantiationError", async () => {
  const trigger = new ManualTestTriggerConfig("Manual trigger", "trigger");
  const failing = new FailingPlanningNodeConfig("failing", "failing");
  const workflow = new WorkflowBuilder({ id: "wf.planning.fail.runWorkflow", name: "Planning fail run workflow" })
    .trigger(trigger)
    .then(failing)
    .build();

  const kit = createEngineTestKit();
  await kit.start([workflow]);

  const result = await kit.engine.runWorkflow(workflow, "trigger", []);

  assert.equal(result.status, "failed");
  assert.match(result.error?.message ?? "", /simulated planning failure/);

  const stored = await kit.runStore.load(result.runId);
  assert.equal(stored?.status, "failed");
  const snapshot = stored?.nodeSnapshotsByNodeId["failing"];
  assert.equal(snapshot?.status, "failed");
  assert.equal(snapshot?.error?.name, "NodeInstantiationError");
});

test("runWorkflow rethrows non-NodeInstantiationError planning failures (cyclic graph)", async () => {
  const b = dag({ id: "wf.cycle.runWorkflow", name: "Run" });
  const a = b.add(new CallbackNodeConfig("A", () => {}, { id: "A" }));
  const nodeB = b.add(new CallbackNodeConfig("B", () => {}, { id: "B" }));
  b.connect(a, nodeB);
  b.connect(nodeB, a);
  const wf = b.build();

  const kit = createEngineTestKit();
  await kit.start([wf]);

  await assert.rejects(() => kit.engine.runWorkflow(wf, "A", items([{ v: 1 }])), /directed cycle/);
});

test("runWorkflowFromState rethrows non-NodeInstantiationError planning failures (cyclic graph)", async () => {
  const b = dag({ id: "wf.cycle.fromState", name: "Run" });
  const a = b.add(new CallbackNodeConfig("A", () => {}, { id: "A" }));
  const nodeB = b.add(new CallbackNodeConfig("B", () => {}, { id: "B" }));
  b.connect(a, nodeB);
  b.connect(nodeB, a);
  const wf = b.build();

  const kit = createEngineTestKit();
  await kit.start([wf]);

  await assert.rejects(
    () =>
      kit.engine.runWorkflowFromState({
        workflow: wf,
        items: [],
        stopCondition: { kind: "workflowCompleted" },
      }),
    /directed cycle/,
  );
});
