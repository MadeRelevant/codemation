import type { HttpMethod } from "@codemation/core";

export type WebhookEndpointDefinition = Readonly<{
  endpointId: string;
  workflowId: string;
  nodeId: string;
  methods: ReadonlyArray<HttpMethod>;
  parseJsonBody?: (body: unknown) => unknown;
}>;

export interface WebhookEndpointRepository {
  register(endpoint: WebhookEndpointDefinition): Promise<void>;

  get(endpointId: string): Promise<WebhookEndpointDefinition | undefined>;
}
