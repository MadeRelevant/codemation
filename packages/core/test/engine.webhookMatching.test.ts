import test from "node:test";
import assert from "node:assert/strict";

import type { TriggerNodeConfig, TriggerSetupContext, TypeToken } from "../dist/index.js";
import { WorkflowBuilder } from "../dist/index.js";
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

  async setup(ctx: TriggerSetupContext<MatchingWebhookTriggerConfig>): Promise<void> {
    ctx.registerWebhook({
      endpointKey: ctx.config.endpointKey,
      methods: ctx.config.methods,
      parseJsonBody: (body) => body,
    });
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
