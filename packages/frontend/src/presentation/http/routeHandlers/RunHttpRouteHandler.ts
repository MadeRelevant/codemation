import { ApplicationRequestError } from "../../../application/ApplicationRequestError";
import type { CommandBus } from "../../../application/bus/CommandBus";
import type { QueryBus } from "../../../application/bus/QueryBus";
import { ReplayWorkflowNodeCommand } from "../../../application/commands/ReplayWorkflowNodeCommand";
import { ReplaceMutableRunWorkflowSnapshotCommand } from "../../../application/commands/ReplaceMutableRunWorkflowSnapshotCommand";
import { SetPinnedNodeInputCommand } from "../../../application/commands/SetPinnedNodeInputCommand";
import { StartWorkflowRunCommand } from "../../../application/commands/StartWorkflowRunCommand";
import type {
  CreateRunRequest,
  RunNodeRequest,
  UpdateRunNodePinRequest,
  UpdateRunWorkflowSnapshotRequest,
} from "../../../application/contracts/RunContracts";
import { GetRunStateQuery } from "../../../application/queries/GetRunStateQuery";
import { HandlesHttpRoute } from "../HandlesHttpRoute";
import { Route } from "../Route";
import { ServerHttpErrorResponseFactory } from "../ServerHttpErrorResponseFactory";
import type { ServerHttpRouteParams } from "../ServerHttpRouteParams";

@HandlesHttpRoute.for()
export class RunHttpRouteHandler {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Route.for("GET", "runs/:runId")
  async getRun(_: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const state = await this.queryBus.execute(new GetRunStateQuery(params.runId!));
      if (!state) {
        return Response.json({ error: "Unknown runId" }, { status: 404 });
      }
      return Response.json(state);
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  @Route.for("POST", "runs")
  async postRuns(request: Request, _: ServerHttpRouteParams): Promise<Response> {
    try {
      const body = await this.readJsonBody<CreateRunRequest>(request);
      return Response.json(await this.commandBus.execute(new StartWorkflowRunCommand(body)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  @Route.for("PATCH", "runs/:runId/workflow-snapshot")
  async patchRunWorkflowSnapshot(request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const body = await this.readJsonBody<UpdateRunWorkflowSnapshotRequest>(request);
      return Response.json(await this.commandBus.execute(new ReplaceMutableRunWorkflowSnapshotCommand(params.runId!, body)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  @Route.for("PATCH", "runs/:runId/nodes/:nodeId/pin")
  async patchRunNodePin(request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const body = await this.readJsonBody<UpdateRunNodePinRequest>(request);
      return Response.json(await this.commandBus.execute(new SetPinnedNodeInputCommand(params.runId!, params.nodeId!, body)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  @Route.for("POST", "runs/:runId/nodes/:nodeId/run")
  async postRunNode(request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const body = await this.readJsonBody<RunNodeRequest>(request);
      return Response.json(await this.commandBus.execute(new ReplayWorkflowNodeCommand(params.runId!, params.nodeId!, body)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  private async readJsonBody<TBody>(request: Request): Promise<TBody> {
    try {
      return (await request.json()) as TBody;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ApplicationRequestError(400, `Invalid JSON body: ${message}`);
    }
  }
}
