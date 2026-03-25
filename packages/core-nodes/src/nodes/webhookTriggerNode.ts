import type {
  ExecutableTriggerNode,
  Items,
  NodeExecutionContext,
  NodeOutputs,
  TriggerSetupContext,
} from "@codemation/core";
import { node } from "@codemation/core";
import { WebhookTrigger } from "./WebhookTriggerFactory";

/**
 * HTTP webhooks are not registered in trigger setup. The host exposes a single catch-all route
 * (e.g. `/api/webhooks/:endpointPath`); the engine's catalog-backed webhook matcher resolves the
 * user-defined endpoint path to this workflow + node, then runs the workflow from this trigger.
 */
@node({ packageName: "@codemation/core-nodes" })
export class WebhookTriggerNode implements ExecutableTriggerNode<WebhookTrigger<any>> {
  readonly kind = "trigger" as const;
  readonly outputPorts = ["main"] as const;

  async setup(_ctx: TriggerSetupContext<WebhookTrigger<any>>): Promise<undefined> {
    return undefined;
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
