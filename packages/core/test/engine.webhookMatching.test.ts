import test from "node:test";
import assert from "node:assert/strict";

import type { Items, NodeExecutionContext, NodeOutputs, TriggerNodeConfig, TriggerSetupContext, TypeToken } from "../src/index.ts";
import { WorkflowBuilder } from "../src/index.ts";
import { createEngineTestKit } from "./harness/index.ts";

class MatchingWebhookTriggerConfig implements TriggerNodeConfig<unknown> {
  readonly kind = "trigger" as const;
  readonly type: TypeToken<unknown> = MatchingWebhookTriggerNode;

  constructor(
    public readonly name: string,
    public readonly endpointKey: string,
    public readonly methods: ReadonlyArray<"GET" | "POST" | "PUT" | "PATCH" | "DELETE">,
    public readonly id?: string,
  ) {}
}

class MatchingWebhookTriggerNode {
  readonly kind = "trigger" as const;
  readonly outputPorts = ["main"] as const;

  async setup(ctx: TriggerSetupContext<MatchingWebhookTriggerConfig>): Promise<undefined> {
    ctx.registerWebhook({
      endpointKey: ctx.config.endpointKey,
      methods: ctx.config.methods,
      parseJsonBody: (body) => body,
    });
    return undefined;
  }

  async execute(items: Items, _ctx: NodeExecutionContext<MatchingWebhookTriggerConfig>): Promise<NodeOutputs> {
    return { main: items };
  }
}

test("engine matches registered webhook endpoints back to workflow triggers", async () => {
  const trigger = new MatchingWebhookTriggerConfig("Webhook trigger", "incoming", ["POST"], "trigger");
  const workflow = new WorkflowBuilder({ id: "wf.webhook.match", name: "Webhook match" }).trigger(trigger).build();
  const kit = createEngineTestKit();

  await kit.start([workflow]);

  const match = kit.engine.matchWebhookTrigger({
    endpointId: "wf.webhook.match.trigger.incoming",
    method: "POST",
  });

  assert.deepEqual(match && { workflowId: match.workflowId, nodeId: match.nodeId, endpointId: match.endpointId }, {
    workflowId: "wf.webhook.match",
    nodeId: "trigger",
    endpointId: "wf.webhook.match.trigger.incoming",
  });
});

test("engine webhook matcher rejects methods that were not registered", async () => {
  const trigger = new MatchingWebhookTriggerConfig("Webhook trigger", "incoming", ["POST"], "trigger");
  const workflow = new WorkflowBuilder({ id: "wf.webhook.methods", name: "Webhook methods" }).trigger(trigger).build();
  const kit = createEngineTestKit();

  await kit.start([workflow]);

  const match = kit.engine.matchWebhookTrigger({
    endpointId: "wf.webhook.methods.trigger.incoming",
    method: "GET",
  });

  assert.equal(match, undefined);
});
