import type { Items, NodeId, ParentExecutionRef, PersistedRunState, RunListingStore, WorkflowDefinition } from "@codemation/core";
import type { CodemationBootstrapResult } from "../bootstrapDiscovery";
import { codemationNextRuntimeRegistry } from "../runtime/codemationNextRuntimeRegistry";
import { CodemationWorkflowDtoMapper } from "../host/codemationWorkflowDtoMapper";
import { WebhookRouteHandler } from "./WebhookRouteHandler";

export const codemationNodeRuntime = "nodejs";

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

type RouteConfigOverride = Readonly<{ configOverride?: CodemationBootstrapResult }>;

class RunRequestItemsResolver {
  static resolve(workflow: WorkflowDefinition, startAt: string, items?: Items): Items {
    if (items) {
      return items;
    }
    return this.isWebhookTrigger(workflow, startAt) ? [] : [{ json: {} }];
  }

  private static isWebhookTrigger(workflow: WorkflowDefinition, startAt: string): boolean {
    const startNode = workflow.nodes.find((node) => node.id === startAt);
    if (!startNode || startNode.kind !== "trigger") {
      return false;
    }
    const token = startNode.config?.token as Readonly<{ name?: unknown }> | undefined;
    return token?.name === "WebhookTriggerNode";
  }
}

export async function getWorkflowsRoute(args?: RouteConfigOverride): Promise<Response> {
  const setup = await codemationNextRuntimeRegistry.getSetup(args);
  const workflowDtoMapper = setup.application.getContainer().resolve(CodemationWorkflowDtoMapper);
  return Response.json(setup.application.getWorkflows().map((workflow) => workflowDtoMapper.toSummary(workflow)));
}

export async function getWorkflowRoute(
  _: Request,
  context: { params: Promise<{ workflowId: string }> },
  args?: RouteConfigOverride,
): Promise<Response> {
  const { workflowId } = await context.params;
  const setup = await codemationNextRuntimeRegistry.getSetup(args);
  const workflow = setup.application.getWorkflows().find((entry) => entry.id === decodeURIComponent(workflowId));
  if (!workflow) {
    return Response.json({ error: "Unknown workflowId" }, { status: 404 });
  }
  const workflowDtoMapper = setup.application.getContainer().resolve(CodemationWorkflowDtoMapper);
  return Response.json(workflowDtoMapper.toDetail(workflow));
}

export async function getWorkflowRunsRoute(
  _: Request,
  context: { params: Promise<{ workflowId: string }> },
  args?: RouteConfigOverride,
): Promise<Response> {
  const { workflowId } = await context.params;
  const runStore = await codemationNextRuntimeRegistry.getPreparedRunStore(args);
  const listingStore = runStore as unknown as Partial<RunListingStore>;
  const runs = listingStore.listRuns ? await listingStore.listRuns({ workflowId: decodeURIComponent(workflowId), limit: 50 }) : [];
  return Response.json(runs);
}

export async function getRunRoute(
  _: Request,
  context: { params: Promise<{ runId: string }> },
  args?: RouteConfigOverride,
): Promise<Response> {
  const { runId } = await context.params;
  const runStore = await codemationNextRuntimeRegistry.getPreparedRunStore(args);
  const state = await runStore.load(decodeURIComponent(runId));
  if (!state) {
    return Response.json({ error: "Unknown runId" }, { status: 404 });
  }
  return Response.json(state);
}

export async function postRunRoute(req: Request, args?: RouteConfigOverride): Promise<Response> {
  const body = (await req.json()) as RunRequestBody;
  if (!body.workflowId) {
    return Response.json({ error: "Missing workflowId" }, { status: 400 });
  }

  const runtime = await codemationNextRuntimeRegistry.getRuntime(args);
  const workflow = runtime.getWorkflow(body.workflowId);
  if (!workflow) {
    return Response.json({ error: "Unknown workflowId" }, { status: 404 });
  }

  const startAt = body.startAt ?? workflow.nodes.find((node) => node.kind === "trigger")?.id ?? workflow.nodes[0]!.id;
  const items = RunRequestItemsResolver.resolve(workflow, startAt, body.items);
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

export async function postWebhookRoute(
  req: Request,
  context: { params: Promise<{ endpointId: string }> },
  args?: RouteConfigOverride,
): Promise<Response> {
  const setup = await codemationNextRuntimeRegistry.getSetup(args);
  const handler = setup.application.getContainer().resolve(WebhookRouteHandler);
  return await handler.handle(req, context, args);
}

export const CodemationRealtimeRouteHandlers = {
  async postReady(args?: RouteConfigOverride): Promise<Response> {
    const runtime = await codemationNextRuntimeRegistry.getRuntime(args);
    console.info(`[codemation-routes.server] realtime ready websocketPort=${runtime.getWebsocketPort()}`);
    return Response.json({ ok: true, websocketPort: runtime.getWebsocketPort() });
  },
} as const;
