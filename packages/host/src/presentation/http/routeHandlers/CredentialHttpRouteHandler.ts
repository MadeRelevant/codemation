import { inject,injectable } from "@codemation/core";
import { HttpRequestJsonBodyReader } from "../HttpRequestJsonBodyReader";
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
} from "../../../application/contracts/CredentialContractsRegistry";
import {
GetCredentialFieldEnvStatusQuery,
GetCredentialInstanceQuery,
GetCredentialInstanceWithSecretsQuery,
GetWorkflowCredentialHealthQuery,
ListCredentialInstancesQuery,
ListCredentialTypesQuery,
} from "../../../application/queries/CredentialQueryHandlers";
import { ApplicationTokens } from "../../../applicationTokens";
import { ServerHttpErrorResponseFactory } from "../ServerHttpErrorResponseFactory";
import type { ServerHttpRouteParams } from "../ServerHttpRouteParams";

@injectable()
export class CredentialHttpRouteHandler {
  constructor(
    @inject(ApplicationTokens.QueryBus)
    private readonly queryBus: QueryBus,
    @inject(ApplicationTokens.CommandBus)
    private readonly commandBus: CommandBus,
  ) {}

  async getCredentialTypes(): Promise<Response> {
    try {
      return Response.json(await this.queryBus.execute(new ListCredentialTypesQuery()));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async getCredentialFieldEnvStatus(): Promise<Response> {
    try {
      return Response.json(await this.queryBus.execute(new GetCredentialFieldEnvStatusQuery()));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async getCredentialInstances(): Promise<Response> {
    try {
      return Response.json(await this.queryBus.execute(new ListCredentialInstancesQuery()));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async getCredentialInstance(request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const withSecrets = new URL(request.url).searchParams.get("withSecrets") === "1";
      const instance = withSecrets
        ? await this.queryBus.execute(new GetCredentialInstanceWithSecretsQuery(params.instanceId!))
        : await this.queryBus.execute(new GetCredentialInstanceQuery(params.instanceId!));
      if (!instance) {
        return Response.json({ error: "Unknown credential instance" }, { status: 404 });
      }
      return Response.json(instance);
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async postCredentialInstance(request: Request): Promise<Response> {
    try {
      const body = await HttpRequestJsonBodyReader.readJsonBody<CreateCredentialInstanceRequest>(request);
      return Response.json(await this.commandBus.execute(new CreateCredentialInstanceCommand(body)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async putCredentialInstance(request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const body = await HttpRequestJsonBodyReader.readJsonBody<UpdateCredentialInstanceRequest>(request);
      return Response.json(await this.commandBus.execute(new UpdateCredentialInstanceCommand(params.instanceId!, body)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async deleteCredentialInstance(_: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      return Response.json(await this.commandBus.execute(new DeleteCredentialInstanceCommand(params.instanceId!)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async putCredentialBinding(request: Request): Promise<Response> {
    try {
      const body = await HttpRequestJsonBodyReader.readJsonBody<UpsertCredentialBindingRequest>(request);
      return Response.json(await this.commandBus.execute(new UpsertCredentialBindingCommand(body)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async postCredentialInstanceTest(_: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      return Response.json(await this.commandBus.execute(new TestCredentialInstanceCommand(params.instanceId!)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async getWorkflowCredentialHealth(_: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      return Response.json(await this.queryBus.execute(new GetWorkflowCredentialHealthQuery(params.workflowId!)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

}
