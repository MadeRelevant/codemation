import type { Items, NodeId, WorkflowId } from "./workflowTypes";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface WebhookControlSignal {
  readonly __webhookControl: true;
  readonly kind: "respondNow" | "respondNowAndContinue";
  readonly responseItems: Items;
  readonly continueItems?: Items;
}

export interface WebhookTriggerRoutingDiagnostics {
  warn(message: string): void;
  /** Inactive workflows omitted from the webhook route index (optional; host should wire for clarity at boot/reload). */
  info?(message: string): void;
}

export interface TriggerInstanceId {
  workflowId: WorkflowId;
  nodeId: NodeId;
}

/** Match for an incoming HTTP request: user-defined URL segment + workflow trigger node. */
export interface WebhookInvocationMatch {
  /** Same value as the webhook trigger's configured endpoint key (URL segment under the webhook base path). */
  endpointPath: string;
  workflowId: WorkflowId;
  nodeId: NodeId;
  methods: ReadonlyArray<HttpMethod>;
  parseJsonBody?: (body: unknown) => unknown;
}

/** Result of resolving an HTTP method + endpoint path against the catalog webhook index (404 vs 405 vs match). */
export type WebhookTriggerResolution =
  | { status: "notFound" }
  | { status: "methodNotAllowed"; match: WebhookInvocationMatch }
  | { status: "ok"; match: WebhookInvocationMatch };

/**
 * Resolves webhook routes from workflow definitions (catalog-backed index, no registration at trigger setup).
 */
export interface WebhookTriggerMatcher {
  match(args: { endpointPath: string; method: HttpMethod }): WebhookInvocationMatch | undefined;
  lookup(endpointPath: string): WebhookInvocationMatch | undefined;
  onEngineWorkflowsLoaded?(): void;
  onEngineStopped?(): void;
  /** Rebuild route index after activation changes without stopping the engine. */
  reloadWebhookRoutes?(): void;
}
