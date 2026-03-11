import { CodemationApp } from "../CodemationApp";
import type { CodemationBootstrapResult } from "../bootstrapDiscovery";
import { RealtimeRouteHandler } from "./RealtimeRouteHandler";
import { RunRouteHandler } from "./RunRouteHandler";
import { WebhookRouteHandler } from "./WebhookRouteHandler";
import { WorkflowRouteHandler } from "./WorkflowRouteHandler";

export const codemationNodeRuntime = "nodejs";

type RouteConfigOverride = Readonly<{ configOverride?: CodemationBootstrapResult }>;

export async function getWorkflowsRoute(args?: RouteConfigOverride): Promise<Response> {
  return await (await CodemationApp.resolve(WorkflowRouteHandler, args)).getWorkflows();
}

export async function getWorkflowRoute(
  _: Request,
  context: { params: Promise<{ workflowId: string }> },
  args?: RouteConfigOverride,
): Promise<Response> {
  const { workflowId } = await context.params;
  return await (await CodemationApp.resolve(WorkflowRouteHandler, args)).getWorkflow(workflowId);
}

export async function getWorkflowRunsRoute(
  _: Request,
  context: { params: Promise<{ workflowId: string }> },
  args?: RouteConfigOverride,
): Promise<Response> {
  const { workflowId } = await context.params;
  return await (await CodemationApp.resolve(WorkflowRouteHandler, args)).getWorkflowRuns(workflowId, args);
}

export async function getRunRoute(
  _: Request,
  context: { params: Promise<{ runId: string }> },
  args?: RouteConfigOverride,
): Promise<Response> {
  const { runId } = await context.params;
  return await (await CodemationApp.resolve(RunRouteHandler, args)).getRun(runId, args);
}

export async function postRunRoute(req: Request, args?: RouteConfigOverride): Promise<Response> {
  return await (await CodemationApp.resolve(RunRouteHandler, args)).postRun(req, args);
}

export async function postWebhookRoute(
  req: Request,
  context: { params: Promise<{ endpointId: string }> },
  args?: RouteConfigOverride,
): Promise<Response> {
  return await (await CodemationApp.resolve(WebhookRouteHandler, args)).handle(req, context, args);
}

export const CodemationRealtimeRouteHandlers = {
  async postReady(args?: RouteConfigOverride): Promise<Response> {
    return await (await CodemationApp.resolve(RealtimeRouteHandler, args)).postReady(args);
  },
} as const;
