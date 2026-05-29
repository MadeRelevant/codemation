import { inject, injectable } from "@codemation/core";
import { HttpRequestJsonBodyReader } from "../HttpRequestJsonBodyReader";
import type { CommandBus } from "../../../application/bus/CommandBus";
import type { QueryBus } from "../../../application/bus/QueryBus";
import type { SessionVerifier } from "../../../application/auth/SessionVerifier";
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
  GetCredentialAppsQuery,
  GetCredentialFieldEnvStatusQuery,
  GetCredentialInstanceQuery,
  GetCredentialInstanceWithSecretsQuery,
  GetWorkflowCredentialHealthQuery,
  ListCredentialInstancesQuery,
  ListCredentialTypesQuery,
} from "../../../application/queries/CredentialQueryHandlers";
import { ApplicationTokens } from "../../../applicationTokens";
import type { PairingConfig } from "../../../pairing/pairing.types";
import { PairingConfigToken } from "../../../pairing/PairingConfigToken";
import { ServerHttpErrorResponseFactory } from "../ServerHttpErrorResponseFactory";
import type { ServerHttpRouteParams } from "../ServerHttpRouteParams";

@injectable()
export class CredentialHttpRouteHandler {
  constructor(
    @inject(ApplicationTokens.QueryBus)
    private readonly queryBus: QueryBus,
    @inject(ApplicationTokens.CommandBus)
    private readonly commandBus: CommandBus,
    @inject(ApplicationTokens.SessionVerifier)
    private readonly sessionVerifier: SessionVerifier,
    @inject(PairingConfigToken, { isOptional: true })
    private readonly pairingConfig: PairingConfig | null,
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

  async getCredentialApps(): Promise<Response> {
    try {
      return Response.json(await this.queryBus.execute(new GetCredentialAppsQuery()));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async getCredentialInstance(request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const withSecrets = new URL(request.url).searchParams.get("withSecrets") === "1";

      if (withSecrets) {
        // Ownership check: fail-closed.
        // - If the session verifier returns null (unauthenticated), reject.
        // - In managed-JWT mode the principal's workspaceId must match the
        //   installation's own workspaceId (from PairingConfig).
        // - In local-auth mode (pairingConfig absent) a valid non-null principal
        //   is sufficient — no cross-workspace check is possible or needed.
        const principal = await this.sessionVerifier.verify(request);
        if (!principal) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
        if (
          principal.source === "managed-jwt" &&
          this.pairingConfig !== null &&
          principal.workspaceId !== this.pairingConfig.workspaceId
        ) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }
      }

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
      return Response.json(
        await this.commandBus.execute(new UpdateCredentialInstanceCommand(params.instanceId!, body)),
      );
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
      const health = await this.queryBus.execute(new GetWorkflowCredentialHealthQuery(params.workflowId!));
      return Response.json(health);
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }
}
