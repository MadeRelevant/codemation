import type { HttpMethod, Items, NodeActivationObserver, NodeActivationStats, NodeId, WebhookRegistrar, WebhookRegistration, WorkflowId } from "@codemation/core";
import { injectable } from "@codemation/core";
import { CodemationWebhookRegistry } from "./codemationWebhookRegistry";

@injectable()
export class CodemationServerEngineHost implements WebhookRegistrar, NodeActivationObserver {
  constructor(
    private readonly webhookRegistry: CodemationWebhookRegistry,
    private readonly webhookBasePath: string,
  ) {}

  registerWebhook(spec: Readonly<{
    workflowId: WorkflowId;
    nodeId: NodeId;
    endpointKey: string;
    method: HttpMethod;
    handler: (req: unknown) => Promise<Items>;
    basePath: string;
  }>): WebhookRegistration {
    const endpointId = `${spec.workflowId}.${spec.nodeId}.${spec.endpointKey}`;
    const path = `${this.webhookBasePath}/${endpointId}`;
    this.webhookRegistry.register({ endpointId, method: spec.method, handler: spec.handler });
    return { endpointId, method: spec.method, path };
  }

  onNodeActivation(_stats: NodeActivationStats): void {}
}
