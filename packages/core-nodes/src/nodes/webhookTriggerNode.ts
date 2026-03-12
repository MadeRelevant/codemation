import type { ExecutableTriggerNode, Items, NodeExecutionContext, NodeOutputs, TriggerSetupContext } from "@codemation/core";
import { node } from "@codemation/core";
import { WebhookTrigger } from "./webhookTrigger";

@node({ packageName: "@codemation/core-nodes" })
export class WebhookTriggerNode implements ExecutableTriggerNode<WebhookTrigger<any>> {
  readonly kind = "trigger" as const;
  readonly outputPorts = ["main"] as const;

  async setup(ctx: TriggerSetupContext<WebhookTrigger<any>>): Promise<void> {
    ctx.registerWebhook({
      endpointKey: ctx.config.endpointKey,
      methods: ctx.config.methods,
      parseJsonBody: ctx.config.inputSchema ? (body) => ctx.config.parseJsonBody(body) : undefined,
    });
  }

  async execute(items: Items, _ctx: NodeExecutionContext<WebhookTrigger<any>>): Promise<NodeOutputs> {
    if (items.length === 0) {
      throw new Error(
        `Webhook trigger "${_ctx.config.name}" requires a webhook request. Invoke this workflow through its webhook endpoint until manual request simulation is supported.`,
      );
    }
    const result = await _ctx.config.handler(items, _ctx);
    return { main: result ?? items };
  }
}
