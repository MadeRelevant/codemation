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
} from "../src/index.ts";
import { WorkflowBuilder } from "../src/index.ts";
import { createEngineTestKit } from "./harness/index.ts";

class CleanupAwareTriggerConfig implements TriggerNodeConfig<unknown> {
  readonly kind = "trigger" as const;
  readonly type: TypeToken<unknown> = CleanupAwareTriggerNode;

  constructor(
    public readonly name: string,
    public readonly endpointKey: string,
    public readonly cleanupCalls: string[],
    public readonly id?: string,
  ) {}
}

class CleanupAwareTriggerNode implements TriggerNode<CleanupAwareTriggerConfig> {
  readonly kind = "trigger" as const;
  readonly outputPorts = ["main"] as const;

  async setup(ctx: TriggerSetupContext<CleanupAwareTriggerConfig>): Promise<undefined> {
    ctx.registerWebhook({
      endpointKey: ctx.config.endpointKey,
      methods: ["POST"],
    });
    ctx.registerCleanup({
      stop: () => {
        ctx.config.cleanupCalls.push(`${ctx.trigger.workflowId}:${ctx.trigger.nodeId}`);
      },
    });
    return undefined;
  }

  async execute(items: Items, _ctx: NodeExecutionContext<CleanupAwareTriggerConfig>): Promise<NodeOutputs> {
    return { main: items };
  }
}

class RuntimeRevisionSwapFixture {
  static createWorkflow(config: CleanupAwareTriggerConfig) {
    return new WorkflowBuilder({
      id: "wf.runtime.swap",
      name: "Runtime swap workflow",
    })
      .trigger(config)
      .build();
  }
}

test("engine stop tears down registered trigger cleanups and clears webhook matches", async () => {
  const cleanupCalls: string[] = [];
  const workflow = RuntimeRevisionSwapFixture.createWorkflow(
    new CleanupAwareTriggerConfig("Trigger", "incoming", cleanupCalls, "trigger_a"),
  );
  const kit = createEngineTestKit({
    providers: new Map([[CleanupAwareTriggerNode, new CleanupAwareTriggerNode()]]),
  });

  await kit.start([workflow]);

  assert.ok(
    kit.engine.matchWebhookTrigger({
      endpointId: "wf.runtime.swap.trigger_a.incoming",
      method: "POST",
    }),
  );

  await kit.engine.stop();

  assert.deepEqual(cleanupCalls, ["wf.runtime.swap:trigger_a"]);
  assert.equal(
    kit.engine.matchWebhookTrigger({
      endpointId: "wf.runtime.swap.trigger_a.incoming",
      method: "POST",
    }),
    undefined,
  );
});

test("engine start replaces the live trigger runtime and webhook registrations on the same engine instance", async () => {
  const cleanupCalls: string[] = [];
  const kit = createEngineTestKit({
    providers: new Map([[CleanupAwareTriggerNode, new CleanupAwareTriggerNode()]]),
  });

  await kit.start([
    RuntimeRevisionSwapFixture.createWorkflow(
      new CleanupAwareTriggerConfig("Trigger A", "incoming_a", cleanupCalls, "trigger_a"),
    ),
  ]);

  assert.ok(
    kit.engine.matchWebhookTrigger({
      endpointId: "wf.runtime.swap.trigger_a.incoming_a",
      method: "POST",
    }),
  );

  await kit.engine.start([
    RuntimeRevisionSwapFixture.createWorkflow(
      new CleanupAwareTriggerConfig("Trigger B", "incoming_b", cleanupCalls, "trigger_b"),
    ),
  ]);

  assert.deepEqual(cleanupCalls, ["wf.runtime.swap:trigger_a"]);
  assert.equal(
    kit.engine.matchWebhookTrigger({
      endpointId: "wf.runtime.swap.trigger_a.incoming_a",
      method: "POST",
    }),
    undefined,
  );
  assert.ok(
    kit.engine.matchWebhookTrigger({
      endpointId: "wf.runtime.swap.trigger_b.incoming_b",
      method: "POST",
    }),
  );
});
