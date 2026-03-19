import type { Items, NodeId, WorkflowId } from "./workflowTypes";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface WebhookControlSignal {
  readonly __webhookControl: true;
  readonly kind: "respondNow" | "respondNowAndContinue";
  readonly responseItems: Items;
  readonly continueItems?: Items;
}

export interface WebhookSpec {
  endpointKey: string;
  methods: ReadonlyArray<HttpMethod>;
  parseJsonBody?: (body: unknown) => unknown;
}

export interface WebhookRegistration {
  endpointId: string;
  methods: ReadonlyArray<HttpMethod>;
  path: string;
}

export interface TriggerInstanceId {
  workflowId: WorkflowId;
  nodeId: NodeId;
}

export interface WebhookInvocationMatch {
  endpointId: string;
  workflowId: WorkflowId;
  nodeId: NodeId;
  methods: ReadonlyArray<HttpMethod>;
  parseJsonBody?: (body: unknown) => unknown;
}

export interface WebhookTriggerMatcher {
  register(args: {
    workflowId: WorkflowId;
    nodeId: NodeId;
    endpointId: string;
    methods: ReadonlyArray<HttpMethod>;
    parseJsonBody?: (body: unknown) => unknown;
  }): void;
  clear?(): void;
  lookup(endpointId: string): WebhookInvocationMatch | undefined;
  match(args: { endpointId: string; method: HttpMethod }): WebhookInvocationMatch | undefined;
}
