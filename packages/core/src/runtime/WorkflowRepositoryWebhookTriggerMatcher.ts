import type {
  HttpMethod,
  NodeDefinition,
  NodeId,
  TriggerNodeConfig,
  WebhookInvocationMatch,
  WebhookTriggerMatcher,
  WebhookTriggerRoutingDiagnostics,
  WorkflowActivationPolicy,
  WorkflowDefinition,
  WorkflowId,
  WorkflowRepository,
} from "../types";

/**
 * Resolves webhook HTTP routes from the live workflow repository (no trigger setup / registration).
 * Maintains an in-memory index keyed by user-defined endpoint path for O(1) lookups after reload.
 */
export class WorkflowRepositoryWebhookTriggerMatcher implements WebhookTriggerMatcher {
  private readonly routeByPath = new Map<string, WebhookInvocationMatch>();
  private engineRoutesActive = false;

  constructor(
    private readonly workflowRepository: WorkflowRepository,
    private readonly workflowActivationPolicy: WorkflowActivationPolicy,
    private readonly diagnostics?: WebhookTriggerRoutingDiagnostics,
  ) {}

  onEngineWorkflowsLoaded(): void {
    this.engineRoutesActive = true;
    this.rebuildRouteIndex();
  }

  onEngineStopped(): void {
    this.engineRoutesActive = false;
    this.routeByPath.clear();
  }

  reloadWebhookRoutes(): void {
    if (!this.engineRoutesActive) {
      return;
    }
    this.rebuildRouteIndex();
  }

  lookup(endpointPath: string): WebhookInvocationMatch | undefined {
    if (!this.engineRoutesActive) {
      return undefined;
    }
    const normalized = this.normalizeEndpointPath(endpointPath);
    return this.routeByPath.get(normalized);
  }

  match(args: { endpointPath: string; method: HttpMethod }): WebhookInvocationMatch | undefined {
    const entry = this.lookup(args.endpointPath);
    if (!entry) {
      return undefined;
    }
    return entry.methods.includes(args.method) ? entry : undefined;
  }

  private rebuildRouteIndex(): void {
    this.routeByPath.clear();
    for (const workflow of this.workflowRepository.list()) {
      if (!this.workflowActivationPolicy.isActive(workflow.id)) {
        const triggerCount = workflow.nodes.filter((n) => n.kind === "trigger").length;
        if (triggerCount > 0) {
          const paths = this.collectWebhookEndpointPaths(workflow);
          if (paths.length > 0) {
            this.diagnostics?.info?.(
              `Workflow "${workflow.name}" (${workflow.id}) is inactive; webhook routes not registered: ${paths.map((p) => `"${p}"`).join(", ")}`,
            );
          } else {
            this.diagnostics?.info?.(
              `Workflow "${workflow.name}" (${workflow.id}) is inactive; no repository webhook routes for its triggers (other trigger kinds are unchanged).`,
            );
          }
        }
        continue;
      }
      for (const def of workflow.nodes) {
        const match = this.tryMatchFromTriggerNode(workflow, def);
        if (!match) {
          continue;
        }
        const key = this.normalizeEndpointPath(match.endpointPath);
        const existing = this.routeByPath.get(key);
        if (existing) {
          this.diagnostics?.warn(
            `Duplicate webhook endpoint path "${key}" (workflows "${existing.workflowId}" and "${match.workflowId}"); using "${match.workflowId}".`,
          );
        }
        this.routeByPath.set(key, match);
      }
    }
  }

  private collectWebhookEndpointPaths(workflow: WorkflowDefinition): string[] {
    const paths: string[] = [];
    for (const def of workflow.nodes) {
      if (def.kind !== "trigger") {
        continue;
      }
      const match = this.tryMatchFromTriggerNode(workflow, def);
      if (match) {
        paths.push(match.endpointPath);
      }
    }
    return paths;
  }

  private tryMatchFromTriggerNode(
    workflow: WorkflowDefinition,
    def: NodeDefinition,
  ): WebhookInvocationMatch | undefined {
    if (def.kind !== "trigger") {
      return undefined;
    }
    const config = def.config as TriggerNodeConfig & {
      endpointKey?: unknown;
      methods?: unknown;
      parseJsonBody?: (body: unknown) => unknown;
    };
    if (typeof config.endpointKey !== "string" || config.endpointKey.length === 0) {
      return undefined;
    }
    if (!Array.isArray(config.methods) || config.methods.length === 0) {
      return undefined;
    }
    const methods = config.methods as HttpMethod[];
    const parseJsonBody = typeof config.parseJsonBody === "function" ? config.parseJsonBody.bind(config) : undefined;
    return {
      endpointPath: config.endpointKey,
      workflowId: workflow.id as WorkflowId,
      nodeId: def.id as NodeId,
      methods: [...methods],
      parseJsonBody,
    };
  }

  private normalizeEndpointPath(endpointPath: string): string {
    return endpointPath.trim();
  }
}
