import type { HttpMethod, WebhookInvocationMatch, WebhookTriggerMatcher } from "../../types";

export class InMemoryWebhookTriggerMatcher implements WebhookTriggerMatcher {
  private readonly entriesByEndpointId = new Map<string, WebhookInvocationMatch>();

  register(args: {
    workflowId: string;
    nodeId: string;
    endpointId: string;
    methods: ReadonlyArray<HttpMethod>;
    parseJsonBody?: (body: unknown) => unknown;
  }): void {
    this.entriesByEndpointId.set(args.endpointId, {
      endpointId: args.endpointId,
      workflowId: args.workflowId,
      nodeId: args.nodeId,
      methods: [...args.methods],
      parseJsonBody: args.parseJsonBody,
    });
  }

  lookup(endpointId: string): WebhookInvocationMatch | undefined {
    return this.entriesByEndpointId.get(endpointId);
  }

  match(args: { endpointId: string; method: HttpMethod }): WebhookInvocationMatch | undefined {
    const entry = this.lookup(args.endpointId);
    if (!entry) {
      return undefined;
    }
    return entry.methods.includes(args.method) ? entry : undefined;
  }
}
