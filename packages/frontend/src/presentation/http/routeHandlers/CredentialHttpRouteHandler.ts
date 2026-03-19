import { ApplicationRequestError } from "../../../application/ApplicationRequestError";
import type { CommandBus } from "../../../application/bus/CommandBus";
import type { QueryBus } from "../../../application/bus/QueryBus";
import {
  CreateCredentialInstanceCommand,
  DeleteCredentialInstanceCommand,
  TestCredentialInstanceCommand,
  UpdateCredentialInstanceCommand,
  UpsertCredentialBindingCommand,
} from "../../../application/commands/CredentialCommandHandlers";
import type {
  CreateCredentialInstanceRequest,
  UpdateCredentialInstanceRequest,
  UpsertCredentialBindingRequest,
} from "../../../application/contracts/CredentialContracts";
import {
  GetCredentialInstanceQuery,
  GetWorkflowCredentialHealthQuery,
  ListCredentialInstancesQuery,
  ListCredentialTypesQuery,
} from "../../../application/queries/CredentialQueryHandlers";
import { ApplicationTokens } from "../../../applicationTokens";
import { inject } from "@codemation/core";
import { HandlesHttpRoute } from "../HandlesHttpRoute";
import { Route } from "../Route";
import { ServerHttpErrorResponseFactory } from "../ServerHttpErrorResponseFactory";
import type { ServerHttpRouteParams } from "../ServerHttpRouteParams";

@HandlesHttpRoute.for()
export class CredentialHttpRouteHandler {
  constructor(
    @inject(ApplicationTokens.QueryBus)
    private readonly queryBus: QueryBus,
    @inject(ApplicationTokens.CommandBus)
    private readonly commandBus: CommandBus,
  ) {}

  @Route.for("GET", "credentials/types")
  async getCredentialTypes(): Promise<Response> {
    try {
      return Response.json(await this.queryBus.execute(new ListCredentialTypesQuery()));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  @Route.for("GET", "credentials/instances")
  async getCredentialInstances(): Promise<Response> {
    try {
      return Response.json(await this.queryBus.execute(new ListCredentialInstancesQuery()));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  @Route.for("GET", "credentials/instances/:instanceId")
  async getCredentialInstance(_: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const instance = await this.queryBus.execute(new GetCredentialInstanceQuery(params.instanceId!));
      if (!instance) {
        return Response.json({ error: "Unknown credential instance" }, { status: 404 });
      }
      return Response.json(instance);
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  @Route.for("POST", "credentials/instances")
  async postCredentialInstance(request: Request): Promise<Response> {
    try {
      const body = await this.readJsonBody<CreateCredentialInstanceRequest>(request);
      return Response.json(await this.commandBus.execute(new CreateCredentialInstanceCommand(body)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  @Route.for("PUT", "credentials/instances/:instanceId")
  async putCredentialInstance(request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const body = await this.readJsonBody<UpdateCredentialInstanceRequest>(request);
      return Response.json(await this.commandBus.execute(new UpdateCredentialInstanceCommand(params.instanceId!, body)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  @Route.for("DELETE", "credentials/instances/:instanceId")
  async deleteCredentialInstance(_: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      return Response.json(await this.commandBus.execute(new DeleteCredentialInstanceCommand(params.instanceId!)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  @Route.for("PUT", "credential-bindings")
  async putCredentialBinding(request: Request): Promise<Response> {
    try {
      const body = await this.readJsonBody<UpsertCredentialBindingRequest>(request);
      return Response.json(await this.commandBus.execute(new UpsertCredentialBindingCommand(body)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  @Route.for("POST", "credentials/instances/:instanceId/test")
  async postCredentialInstanceTest(_: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      return Response.json(await this.commandBus.execute(new TestCredentialInstanceCommand(params.instanceId!)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  @Route.for("GET", "workflows/:workflowId/credential-health")
  async getWorkflowCredentialHealth(_: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      return Response.json(await this.queryBus.execute(new GetWorkflowCredentialHealthQuery(params.workflowId!)));
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
