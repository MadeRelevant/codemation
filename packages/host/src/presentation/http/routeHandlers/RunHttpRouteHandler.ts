import { inject, injectable } from "@codemation/core";
import { HttpRequestJsonBodyReader } from "../HttpRequestJsonBodyReader";
import type { CommandBus } from "../../../application/bus/CommandBus";
import type { QueryBus } from "../../../application/bus/QueryBus";
import { ReplaceMutableRunWorkflowSnapshotCommand } from "../../../application/commands/ReplaceMutableRunWorkflowSnapshotCommand";
import { ReplayWorkflowNodeCommand } from "../../../application/commands/ReplayWorkflowNodeCommand";
import { SetPinnedNodeInputCommand } from "../../../application/commands/SetPinnedNodeInputCommand";
import { StartWorkflowRunCommand } from "../../../application/commands/StartWorkflowRunCommand";
import type {
  CreateRunRequest,
  RunNodeRequest,
  UpdateRunNodePinRequest,
  UpdateRunWorkflowSnapshotRequest,
} from "../../../application/contracts/RunContracts";
import { GetRunStateQuery } from "../../../application/queries/GetRunStateQuery";
import { GetWorkflowRunDetailQuery } from "../../../application/queries/GetWorkflowRunDetailQuery";
import { ApplicationTokens } from "../../../applicationTokens";
import { ServerHttpErrorResponseFactory } from "../ServerHttpErrorResponseFactory";
import type { ServerHttpRouteParams } from "../ServerHttpRouteParams";

@injectable()
export class RunHttpRouteHandler {
  constructor(
    @inject(ApplicationTokens.QueryBus)
    private readonly queryBus: QueryBus,
    @inject(ApplicationTokens.CommandBus)
    private readonly commandBus: CommandBus,
  ) {}

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

  async getRunDetail(_: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const detail = await this.queryBus.execute(new GetWorkflowRunDetailQuery(params.runId!));
      if (!detail) {
        return Response.json({ error: "Unknown runId" }, { status: 404 });
      }
      return Response.json(detail);
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async postRuns(request: Request, _: ServerHttpRouteParams): Promise<Response> {
    try {
      const body = await HttpRequestJsonBodyReader.readJsonBody<CreateRunRequest>(request);
      return Response.json(await this.commandBus.execute(new StartWorkflowRunCommand(body)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async patchRunWorkflowSnapshot(request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const body = await HttpRequestJsonBodyReader.readJsonBody<UpdateRunWorkflowSnapshotRequest>(request);
      return Response.json(
        await this.commandBus.execute(new ReplaceMutableRunWorkflowSnapshotCommand(params.runId!, body)),
      );
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async patchRunNodePin(request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const body = await HttpRequestJsonBodyReader.readJsonBody<UpdateRunNodePinRequest>(request);
      return Response.json(
        await this.commandBus.execute(new SetPinnedNodeInputCommand(params.runId!, params.nodeId!, body)),
      );
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async postRunNode(request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const body = await HttpRequestJsonBodyReader.readJsonBody<RunNodeRequest>(request);
      return Response.json(
        await this.commandBus.execute(new ReplayWorkflowNodeCommand(params.runId!, params.nodeId!, body)),
      );
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }
}
