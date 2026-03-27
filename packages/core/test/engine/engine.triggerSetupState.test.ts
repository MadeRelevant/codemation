import assert from "node:assert/strict";
import { test } from "vitest";
import type {
  Items,
  NodeExecutionContext,
  NodeOutputs,
  PersistedTriggerSetupState,
  TriggerNode,
  TriggerNodeConfig,
  TriggerSetupContext,
  TypeToken,
} from "../../src/index.ts";
import { WorkflowBuilder } from "../../src/index.ts";
import { CallbackNodeConfig, createEngineTestKit } from "../harness/index.ts";

type SetupStatePayload = Readonly<{
  cursor: string;
  leaseOwner?: string;
}>;

class StatefulSetupTriggerConfig implements TriggerNodeConfig<unknown, SetupStatePayload | undefined> {
  readonly kind = "trigger" as const;
  readonly type: TypeToken<unknown> = StatefulSetupTriggerNode;

  constructor(
    public readonly name: string,
    public readonly previousStates: SetupStatePayload[],
    public readonly nextState: SetupStatePayload | undefined,
    public readonly id?: string,
  ) {}
}

class StatefulSetupTriggerNode implements TriggerNode<StatefulSetupTriggerConfig> {
  readonly kind = "trigger" as const;
  readonly outputPorts = ["main"] as const;

  async setup(ctx: TriggerSetupContext<StatefulSetupTriggerConfig>): Promise<SetupStatePayload | undefined> {
    if (ctx.previousState) {
      ctx.config.previousStates.push(ctx.previousState);
    }
    return ctx.config.nextState;
  }

  async execute(items: Items, _ctx: NodeExecutionContext<StatefulSetupTriggerConfig>): Promise<NodeOutputs> {
    return { main: items };
  }
}

class TriggerSetupStateTestFixture {
  static readonly workflowId = "wf.trigger.setup.state";
  static readonly triggerNodeId = "trigger";

  static createWorkflow(config: StatefulSetupTriggerConfig) {
    return new WorkflowBuilder({ id: this.workflowId, name: "Trigger setup state workflow" })
      .trigger(config)
      .then(new CallbackNodeConfig("Collector", () => undefined, "collector"))
      .build();
  }

  static createPersistedState(state: SetupStatePayload): PersistedTriggerSetupState<SetupStatePayload> {
    return {
      trigger: {
        workflowId: this.workflowId,
        nodeId: this.triggerNodeId,
      },
      updatedAt: "2026-03-17T10:00:00.000Z",
      state,
    };
  }
}

test("engine passes the previously persisted trigger setup state into setup()", async () => {
  const previousStates: SetupStatePayload[] = [];
  const config = new StatefulSetupTriggerConfig(
    "Stateful trigger",
    previousStates,
    {
      cursor: "history_2",
    },
    TriggerSetupStateTestFixture.triggerNodeId,
  );
  const kit = createEngineTestKit();
  await kit.triggerSetupStateStore.save(
    TriggerSetupStateTestFixture.createPersistedState({
      cursor: "history_1",
      leaseOwner: "instance-a",
    }),
  );

  await kit.start([TriggerSetupStateTestFixture.createWorkflow(config)]);

  assert.deepEqual(previousStates, [
    {
      cursor: "history_1",
      leaseOwner: "instance-a",
    },
  ]);
});

test("engine persists the next trigger setup state returned from setup()", async () => {
  const config = new StatefulSetupTriggerConfig(
    "Stateful trigger",
    [],
    {
      cursor: "history_9",
      leaseOwner: "instance-b",
    },
    TriggerSetupStateTestFixture.triggerNodeId,
  );
  const kit = createEngineTestKit();

  await kit.start([TriggerSetupStateTestFixture.createWorkflow(config)]);

  const persistedState = await kit.triggerSetupStateStore.load({
    workflowId: TriggerSetupStateTestFixture.workflowId,
    nodeId: TriggerSetupStateTestFixture.triggerNodeId,
  });
  assert.deepEqual(persistedState?.state, {
    cursor: "history_9",
    leaseOwner: "instance-b",
  });
});
