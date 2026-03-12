import type { CodemationBootstrapResult } from "../bootstrapDiscovery";
import { FrontendRouteTokens } from "./frontendRouteTokens";
import { CodemationApp } from "../CodemationApp";

export const codemationNodeRuntime = "nodejs";

type RouteConfigOverride = Readonly<{ configOverride?: CodemationBootstrapResult }>;

export class CodemationRouteHandlers {
  static async getWorkflows(args?: RouteConfigOverride): Promise<Response> {
    return await (await CodemationApp.resolve(FrontendRouteTokens.WorkflowRouteHandler, args)).getWorkflows();
  }

  static async getWorkflow(
    _: Request,
    context: { params: Promise<{ workflowId: string }> },
    args?: RouteConfigOverride,
  ): Promise<Response> {
    return await (await CodemationApp.resolve(FrontendRouteTokens.WorkflowRouteHandler, args)).getWorkflow((await context.params).workflowId);
  }

  static async getWorkflowRuns(
    _: Request,
    context: { params: Promise<{ workflowId: string }> },
    args?: RouteConfigOverride,
  ): Promise<Response> {
    return await (await CodemationApp.resolve(FrontendRouteTokens.WorkflowRouteHandler, args)).getWorkflowRuns((await context.params).workflowId, args);
  }

  static async getRun(
    _: Request,
    context: { params: Promise<{ runId: string }> },
    args?: RouteConfigOverride,
  ): Promise<Response> {
    return await (await CodemationApp.resolve(FrontendRouteTokens.RunRouteHandler, args)).getRun((await context.params).runId, args);
  }

  static async postRun(req: Request, args?: RouteConfigOverride): Promise<Response> {
    return await (await CodemationApp.resolve(FrontendRouteTokens.RunRouteHandler, args)).postRun(req, args);
  }

  static async patchRunWorkflowSnapshot(
    req: Request,
    context: { params: Promise<{ runId: string }> },
    args?: RouteConfigOverride,
  ): Promise<Response> {
    return await (await CodemationApp.resolve(FrontendRouteTokens.RunRouteHandler, args)).patchRunWorkflowSnapshot(req, (await context.params).runId, args);
  }

  static async patchRunNodePin(
    req: Request,
    context: { params: Promise<{ runId: string; nodeId: string }> },
    args?: RouteConfigOverride,
  ): Promise<Response> {
    const params = await context.params;
    return await (await CodemationApp.resolve(FrontendRouteTokens.RunRouteHandler, args)).patchRunNodePin(req, params.runId, params.nodeId, args);
  }

  static async postRunNode(
    req: Request,
    context: { params: Promise<{ runId: string; nodeId: string }> },
    args?: RouteConfigOverride,
  ): Promise<Response> {
    const params = await context.params;
    return await (await CodemationApp.resolve(FrontendRouteTokens.RunRouteHandler, args)).postRunNode(req, params.runId, params.nodeId, args);
  }

  static async postWebhook(
    req: Request,
    context: { params: Promise<{ endpointId: string }> },
    args?: RouteConfigOverride,
  ): Promise<Response> {
    return await (await CodemationApp.resolve(FrontendRouteTokens.WebhookRouteHandler, args)).handle(req, context, args);
  }

  static async postRealtimeReady(args?: RouteConfigOverride): Promise<Response> {
    return await (await CodemationApp.resolve(FrontendRouteTokens.RealtimeRouteHandler, args)).postReady(args);
  }
}
