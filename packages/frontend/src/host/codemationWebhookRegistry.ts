import type { HttpMethod, NodeId, WorkflowId } from "@codemation/core";

export class CodemationWebhookRegistry {
  private readonly entriesByEndpointId = new Map<
    string,
    Readonly<{
      endpointId: string;
      workflowId: WorkflowId;
      nodeId: NodeId;
      methods: ReadonlyArray<HttpMethod>;
      parseJsonBody?: (body: unknown) => unknown;
    }>
  >();

  register(args: Readonly<{
    endpointId: string;
    workflowId: WorkflowId;
    nodeId: NodeId;
    methods: ReadonlyArray<HttpMethod>;
    parseJsonBody?: (body: unknown) => unknown;
  }>): void {
    this.entriesByEndpointId.set(args.endpointId, {
      endpointId: args.endpointId,
      workflowId: args.workflowId,
      nodeId: args.nodeId,
      methods: args.methods,
      parseJsonBody: args.parseJsonBody,
    });
  }

  get(endpointId: string): Readonly<{
    endpointId: string;
    workflowId: WorkflowId;
    nodeId: NodeId;
    methods: ReadonlyArray<HttpMethod>;
    parseJsonBody?: (body: unknown) => unknown;
  }> | undefined {
    return this.entriesByEndpointId.get(endpointId);
  }
}
