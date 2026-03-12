import { injectable } from "@codemation/core";
import type { CodemationBootstrapResult } from "../bootstrapDiscovery";
import { RequestToWebhookItemMapper } from "./RequestToWebhookItemMapper";
import type { WebhookRunResult } from "@codemation/core";
import type { PreparedExecutionRuntimeProvider } from "./frontendRouteTokens";

@injectable()
export class WebhookRouteHandler {
  constructor(
    private readonly runtimeProvider: PreparedExecutionRuntimeProvider,
    private readonly requestToWebhookItemMapper: RequestToWebhookItemMapper,
  ) {}

  async handle(
    req: Request,
    context: Readonly<{ params: Promise<{ endpointId: string }> }>,
    args?: Readonly<{ configOverride?: CodemationBootstrapResult }>,
  ): Promise<Response> {
    const { endpointId } = await context.params;
    const runtime = await this.runtimeProvider.getPreparedExecutionRuntime(args);
    const entry = runtime.webhookRegistry.get(decodeURIComponent(endpointId));
    if (!entry) {
      return Response.json({ error: "Unknown webhook endpoint" }, { status: 404 });
    }

    const requestMethod = req.method.toUpperCase() as typeof entry.methods[number];
    if (!entry.methods.includes(requestMethod)) {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const workflow = runtime.workflowRegistry.get(entry.workflowId);
    if (!workflow) {
      return Response.json({ error: "Unknown workflow for webhook endpoint" }, { status: 404 });
    }

    try {
      const requestItem = await this.requestToWebhookItemMapper.map(req, entry.parseJsonBody);
      const scheduled = await runtime.engine.runWorkflow(workflow, entry.nodeId, [requestItem], undefined, {
        localOnly: true,
        webhook: true,
      });
      if (scheduled.status === "failed") {
        throw new Error(scheduled.error.message);
      }
      const result =
        scheduled.status === "completed"
          ? ({
              runId: scheduled.runId,
              workflowId: scheduled.workflowId,
              startedAt: scheduled.startedAt,
              runStatus: "completed",
              response: scheduled.outputs,
            } satisfies WebhookRunResult)
          : await Promise.race([
              runtime.engine.waitForWebhookResponse(scheduled.runId),
              runtime.engine.waitForCompletion(scheduled.runId).then((completed) => {
                if (completed.status === "failed") {
                  throw new Error(completed.error.message);
                }
                return {
                  runId: completed.runId,
                  workflowId: completed.workflowId,
                  startedAt: completed.startedAt,
                  runStatus: "completed" as const,
                  response: completed.outputs,
                } satisfies WebhookRunResult;
              }),
            ]);
      const payload = result.response.at(-1)?.json ?? null;
      return Response.json(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Response.json({ error: message }, { status: 400 });
    }
  }
}
