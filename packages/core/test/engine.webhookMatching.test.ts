import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Items,
  NodeExecutionContext,
  NodeOutputs,
  TriggerNodeConfig,
  TriggerSetupContext,
  TypeToken,
} from "../src/index.ts";
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

  async setup(_ctx: TriggerSetupContext<MatchingWebhookTriggerConfig>): Promise<undefined> {
    return undefined;
  }

  async execute(items: Items, _ctx: NodeExecutionContext<MatchingWebhookTriggerConfig>): Promise<NodeOutputs> {
    return { main: items };
  }
}

test("engine matches webhook endpoints from workflow catalog to trigger nodes", async () => {
  const trigger = new MatchingWebhookTriggerConfig("Webhook trigger", "incoming", ["POST"], "trigger");
  const workflow = new WorkflowBuilder({ id: "wf.webhook.match", name: "Webhook match" }).trigger(trigger).build();
  const kit = createEngineTestKit();

  await kit.start([workflow]);

  const resolution = kit.engine.resolveWebhookTrigger({
    endpointPath: "incoming",
    method: "POST",
  });

  assert.equal(resolution.status, "ok");
  if (resolution.status !== "ok") throw new Error("expected ok");
  assert.deepEqual(
    {
      workflowId: resolution.match.workflowId,
      nodeId: resolution.match.nodeId,
      endpointPath: resolution.match.endpointPath,
    },
    {
      workflowId: "wf.webhook.match",
      nodeId: "trigger",
      endpointPath: "incoming",
    },
  );
});

test("engine webhook matcher rejects methods that were not registered", async () => {
  const trigger = new MatchingWebhookTriggerConfig("Webhook trigger", "incoming", ["POST"], "trigger");
  const workflow = new WorkflowBuilder({ id: "wf.webhook.methods", name: "Webhook methods" }).trigger(trigger).build();
  const kit = createEngineTestKit();

  await kit.start([workflow]);

  const resolution = kit.engine.resolveWebhookTrigger({
    endpointPath: "incoming",
    method: "GET",
  });

  assert.equal(resolution.status, "methodNotAllowed");
});
