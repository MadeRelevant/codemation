import type { NodeActivationObserver,NodeActivationStats,NodeId,WebhookRegistrar,WebhookRegistration,WorkflowId } from "@codemation/core";
import { injectable } from "@codemation/core";
import { CodemationWebhookRegistry } from "./CodemationWebhookRegistry";

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
    methods: ReadonlyArray<"GET" | "POST" | "PUT" | "PATCH" | "DELETE">;
    parseJsonBody?: (body: unknown) => unknown;
    basePath: string;
  }>): WebhookRegistration {
    const endpointId = `${spec.workflowId}.${spec.nodeId}.${spec.endpointKey}`;
    const path = `${this.webhookBasePath}/${endpointId}`;
    this.webhookRegistry.register({
      endpointId,
      workflowId: spec.workflowId,
      nodeId: spec.nodeId,
      methods: spec.methods,
      parseJsonBody: spec.parseJsonBody,
    });
    return { endpointId, methods: spec.methods, path };
  }

  clear(): void {
    this.webhookRegistry.clear();
  }

  onNodeActivation(_stats: NodeActivationStats): void {}
}
