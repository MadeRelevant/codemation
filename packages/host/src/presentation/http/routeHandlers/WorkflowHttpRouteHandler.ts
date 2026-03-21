import { inject,injectable } from "@codemation/core";
import { HttpRequestJsonBodyReader } from "../HttpRequestJsonBodyReader";
import type { CommandBus } from "../../../application/bus/CommandBus";
import type { QueryBus } from "../../../application/bus/QueryBus";
import { CopyRunToWorkflowDebuggerCommand } from "../../../application/commands/CopyRunToWorkflowDebuggerCommand";
import { ReplaceWorkflowDebuggerOverlayCommand } from "../../../application/commands/ReplaceWorkflowDebuggerOverlayCommand";
import type {
CopyRunToWorkflowDebuggerRequest,
UpdateWorkflowDebuggerOverlayRequest,
} from "../../../application/contracts/WorkflowDebuggerContracts";
import { WorkflowDefinitionMapper } from "../../../application/mapping/WorkflowDefinitionMapper";
import { GetWorkflowDebuggerOverlayQuery } from "../../../application/queries/GetWorkflowDebuggerOverlayQuery";
import { GetWorkflowDetailQuery } from "../../../application/queries/GetWorkflowDetailQuery";
import { GetWorkflowSummariesQuery } from "../../../application/queries/GetWorkflowSummariesQuery";
import { ListWorkflowRunsQuery } from "../../../application/queries/ListWorkflowRunsQuery";
import { ApplicationTokens } from "../../../applicationTokens";
import { ServerHttpErrorResponseFactory } from "../ServerHttpErrorResponseFactory";
import type { ServerHttpRouteParams } from "../ServerHttpRouteParams";

@injectable()
export class WorkflowHttpRouteHandler {
  constructor(
    @inject(ApplicationTokens.QueryBus)
    private readonly queryBus: QueryBus,
    @inject(ApplicationTokens.CommandBus)
    private readonly commandBus: CommandBus,
    @inject(WorkflowDefinitionMapper)
    private readonly workflowDefinitionMapper: WorkflowDefinitionMapper,
  ) {}

  async getWorkflows(_: Request, __: ServerHttpRouteParams): Promise<Response> {
    try {
      const workflows = await this.queryBus.execute(new GetWorkflowSummariesQuery());
      return Response.json(workflows.map((workflow) => this.workflowDefinitionMapper.toSummary(workflow)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

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

  async getWorkflowRuns(_: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      return Response.json(await this.queryBus.execute(new ListWorkflowRunsQuery(params.workflowId!)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async getWorkflowDebuggerOverlay(_: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      return Response.json(await this.queryBus.execute(new GetWorkflowDebuggerOverlayQuery(params.workflowId!)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async putWorkflowDebuggerOverlay(request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const body = await HttpRequestJsonBodyReader.readJsonBody<UpdateWorkflowDebuggerOverlayRequest>(request);
      return Response.json(await this.commandBus.execute(new ReplaceWorkflowDebuggerOverlayCommand(params.workflowId!, body)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async postCopyWorkflowDebuggerOverlay(request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const body = await HttpRequestJsonBodyReader.readJsonBody<CopyRunToWorkflowDebuggerRequest>(request);
      return Response.json(await this.commandBus.execute(new CopyRunToWorkflowDebuggerCommand(params.workflowId!, body)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

}
