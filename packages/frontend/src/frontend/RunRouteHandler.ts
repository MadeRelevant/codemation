import type { Items, NodeId, ParentExecutionRef, PersistedRunState, WorkflowDefinition } from "@codemation/core";
import { injectable } from "@codemation/core";
import type { CodemationBootstrapResult } from "../bootstrapDiscovery";
import type { FrontendRuntimeProvider, PreparedExecutionRuntimeProvider } from "./frontendRouteTokens";

type RunRequestBody = Readonly<{
  workflowId?: string;
  items?: Items;
  startAt?: string;
}>;

type PostRunRouteResponse = Readonly<{
  runId: string;
  workflowId: string;
  startedAt?: string;
  status: string;
  state: PersistedRunState | null;
}>;

@injectable()
export class RunRouteHandler {
  constructor(
    private readonly frontendRuntimeProvider: FrontendRuntimeProvider,
    private readonly preparedExecutionRuntimeProvider: PreparedExecutionRuntimeProvider,
  ) {}

  async getRun(runId: string, args?: Readonly<{ configOverride?: CodemationBootstrapResult }>): Promise<Response> {
    const runtime = await this.preparedExecutionRuntimeProvider.getPreparedExecutionRuntime(args);
    const state = await runtime.runStore.load(decodeURIComponent(runId));
    if (!state) {
      return Response.json({ error: "Unknown runId" }, { status: 404 });
    }
    return Response.json(state);
  }

  async postRun(req: Request, args?: Readonly<{ configOverride?: CodemationBootstrapResult }>): Promise<Response> {
    const body = (await req.json()) as RunRequestBody;
    if (!body.workflowId) {
      return Response.json({ error: "Missing workflowId" }, { status: 400 });
    }

    const runtime = await this.frontendRuntimeProvider.getRuntime(args);
    const workflow = runtime.getWorkflow(body.workflowId);
    if (!workflow) {
      return Response.json({ error: "Unknown workflowId" }, { status: 404 });
    }

    const startAt = body.startAt ?? workflow.nodes.find((node) => node.kind === "trigger")?.id ?? workflow.nodes[0]!.id;
    const items = this.resolveRunRequestItems(workflow, startAt, body.items);
    const result = await runtime.getEngine().runWorkflow(
      workflow,
      startAt as NodeId,
      items,
      undefined as ParentExecutionRef | undefined,
    );
    const state = (await runtime.getRunStore().load(result.runId)) ?? null;
    const response: PostRunRouteResponse = {
      runId: result.runId,
      workflowId: result.workflowId,
      startedAt: result.startedAt,
      status: result.status,
      state,
    };
    console.info(
      `[codemation-routes.server] postRun workflow=${workflow.id} runId=${result.runId} status=${result.status} persistedStatus=${state?.status ?? "missing"}`,
    );
    return Response.json(response);
  }

  private resolveRunRequestItems(workflow: WorkflowDefinition, startAt: string, items?: Items): Items {
    if (items) {
      return items;
    }
    return this.isWebhookTrigger(workflow, startAt) ? [] : [{ json: {} }];
  }

  private isWebhookTrigger(workflow: WorkflowDefinition, startAt: string): boolean {
    const startNode = workflow.nodes.find((node) => node.id === startAt);
    if (!startNode || startNode.kind !== "trigger") {
      return false;
    }
    const token = startNode.config?.token as Readonly<{ name?: unknown }> | undefined;
    return token?.name === "WebhookTriggerNode";
  }
}
