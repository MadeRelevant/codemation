import test from "node:test";
import assert from "node:assert/strict";
import type {
  Items,
  NodeExecutionContext,
  NodeOutputs,
  TestableTriggerNode,
  TriggerNodeConfig,
  TriggerSetupContext,
  TriggerTestItemsContext,
  TypeToken,
} from "../src/index.ts";
import { CallbackNodeConfig, chain, createEngineTestKit, items } from "./harness/index.ts";

type PreviewSetupState = Readonly<{
  previewValue: string;
}>;

class PreviewTriggerConfig implements TriggerNodeConfig<Readonly<{ value: string }>, PreviewSetupState> {
  readonly kind = "trigger" as const;
  readonly type: TypeToken<unknown> = PreviewTriggerNode;

  constructor(
    public readonly name: string,
    public readonly id?: string,
  ) {}
}

class PreviewTriggerNode implements TestableTriggerNode<PreviewTriggerConfig> {
  readonly kind = "trigger" as const;
  readonly outputPorts = ["main"] as const;

  async setup(_ctx: TriggerSetupContext<PreviewTriggerConfig>): Promise<PreviewSetupState> {
    return {
      previewValue: "from_setup_state",
    };
  }

  async getTestItems(ctx: TriggerTestItemsContext<PreviewTriggerConfig, PreviewSetupState>): Promise<Items> {
    return items([{ value: ctx.previousState.previewValue }]);
  }

  async execute(itemsIn: Items, _ctx: NodeExecutionContext<PreviewTriggerConfig>): Promise<NodeOutputs> {
    if (itemsIn.length === 0) {
      throw new Error("Expected trigger test items to be synthesized before execute()");
    }
    return { main: itemsIn };
  }
}

test("engine can synthesize trigger test items and stop at the trigger output", async () => {
  const downstreamEvents: string[] = [];
  const workflow = chain({ id: "wf.trigger.test.items", name: "Trigger test items" })
    .trigger(new PreviewTriggerConfig("Trigger", "trigger"))
    .then(new CallbackNodeConfig("Downstream", () => downstreamEvents.push("downstream"), { id: "downstream" }))
    .build();

  const kit = createEngineTestKit();
  await kit.start([workflow]);

  const testItems = await kit.engine.createTriggerTestItems({
    workflow,
    nodeId: "trigger",
  });
  assert.ok(testItems);
  assert.deepEqual(testItems?.map((item) => item.json), [{ value: "from_setup_state" }]);

  const scheduled = await kit.engine.runWorkflowFromState({
    workflow,
    items: testItems,
    stopCondition: { kind: "nodeCompleted", nodeId: "trigger" },
  });
  const done = scheduled.status === "pending" ? await kit.engine.waitForCompletion(scheduled.runId) : scheduled;

  assert.equal(done.status, "completed");
  assert.deepEqual(done.outputs.map((item) => item.json), [{ value: "from_setup_state" }]);
  assert.deepEqual(downstreamEvents, []);

  const stored = await kit.runStore.load(done.runId);
  assert.equal(stored?.nodeSnapshotsByNodeId.trigger?.status, "completed");
  assert.equal(stored?.nodeSnapshotsByNodeId.downstream, undefined);
});
