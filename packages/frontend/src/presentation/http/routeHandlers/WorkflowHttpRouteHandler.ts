import type { QueryBus } from "../../../application/bus/QueryBus";
import { WorkflowDefinitionMapper } from "../../../application/mapping/WorkflowDefinitionMapper";
import { GetWorkflowDetailQuery } from "../../../application/queries/GetWorkflowDetailQuery";
import { GetWorkflowSummariesQuery } from "../../../application/queries/GetWorkflowSummariesQuery";
import { ListWorkflowRunsQuery } from "../../../application/queries/ListWorkflowRunsQuery";
import { ApplicationTokens } from "../../../applicationTokens";
import { inject } from "@codemation/core";
import { HandlesHttpRoute } from "../HandlesHttpRoute";
import { Route } from "../Route";
import { ServerHttpErrorResponseFactory } from "../ServerHttpErrorResponseFactory";
import type { ServerHttpRouteParams } from "../ServerHttpRouteParams";

@HandlesHttpRoute.for()
export class WorkflowHttpRouteHandler {
  constructor(
    @inject(ApplicationTokens.QueryBus)
    private readonly queryBus: QueryBus,
    @inject(WorkflowDefinitionMapper)
    private readonly workflowDefinitionMapper: WorkflowDefinitionMapper,
  ) {}

  @Route.for("GET", "workflows")
  async getWorkflows(_: Request, __: ServerHttpRouteParams): Promise<Response> {
    try {
      const workflows = await this.queryBus.execute(new GetWorkflowSummariesQuery());
      return Response.json(workflows.map((workflow) => this.workflowDefinitionMapper.toSummary(workflow)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  @Route.for("GET", "workflows/:workflowId")
  async getWorkflow(_: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const workflow = await this.queryBus.execute(new GetWorkflowDetailQuery(params.workflowId!));
      if (!workflow) {
        return Response.json({ error: "Unknown workflowId" }, { status: 404 });
      }
      return Response.json(await this.workflowDefinitionMapper.map(workflow));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  @Route.for("GET", "workflows/:workflowId/runs")
  async getWorkflowRuns(_: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      return Response.json(await this.queryBus.execute(new ListWorkflowRunsQuery(params.workflowId!)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }
}
