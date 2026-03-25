import { inject, injectable } from "@codemation/core";
import { ApplicationRequestError } from "../../../application/ApplicationRequestError";
import type { CommandBus } from "../../../application/bus/CommandBus";
import type { QueryBus } from "../../../application/bus/QueryBus";
import {
  AcceptUserInviteCommand,
  InviteUserCommand,
  RegenerateUserInviteCommand,
  UpdateUserAccountStatusCommand,
} from "../../../application/commands/UserAccountCommandHandlers";
import type {
  AcceptUserInviteRequestDto,
  InviteUserRequestDto,
  UpdateUserAccountStatusRequestDto,
} from "../../../application/contracts/userDirectoryContracts.types";
import { ListUserAccountsQuery, VerifyUserInviteQuery } from "../../../application/queries/UserAccountQueryHandlers";
import { ApplicationTokens } from "../../../applicationTokens";
import { ServerHttpErrorResponseFactory } from "../ServerHttpErrorResponseFactory";
import type { ServerHttpRouteParams } from "../ServerHttpRouteParams";

@injectable()
export class UserHttpRouteHandler {
  constructor(
    @inject(ApplicationTokens.QueryBus)
    private readonly queryBus: QueryBus,
    @inject(ApplicationTokens.CommandBus)
    private readonly commandBus: CommandBus,
  ) {}

  async getUsers(): Promise<Response> {
    try {
      return Response.json(await this.queryBus.execute(new ListUserAccountsQuery()));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async getInviteVerify(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const token = url.searchParams.get("token") ?? "";
      return Response.json(await this.queryBus.execute(new VerifyUserInviteQuery(token)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async postInvite(request: Request): Promise<Response> {
    try {
      const body = await this.readJsonBody<InviteUserRequestDto>(request);
      const origin = this.resolveRequestOrigin(request);
      return Response.json(await this.commandBus.execute(new InviteUserCommand(body.email, origin)), { status: 201 });
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async postRegenerateInvite(request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const userId = params.userId!;
      const origin = this.resolveRequestOrigin(request);
      return Response.json(await this.commandBus.execute(new RegenerateUserInviteCommand(userId, origin)));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async postAcceptInvite(request: Request): Promise<Response> {
    try {
      const body = await this.readJsonBody<AcceptUserInviteRequestDto>(request);
      await this.commandBus.execute(new AcceptUserInviteCommand(body.token, body.password));
      return new Response(null, { status: 204 });
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async patchUserStatus(request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const body = await this.readJsonBody<UpdateUserAccountStatusRequestDto>(request);
      return Response.json(
        await this.commandBus.execute(new UpdateUserAccountStatusCommand(params.userId!, body.status)),
      );
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  private resolveRequestOrigin(request: Request): string {
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const forwardedHost = request.headers.get("x-forwarded-host");
    if (forwardedProto?.trim() && forwardedHost?.trim()) {
      const proto = forwardedProto.split(",")[0]!.trim();
      const host = forwardedHost.split(",")[0]!.trim();
      return `${proto}://${host}`;
    }
    const url = new URL(request.url);
    return `${url.protocol}//${url.host}`;
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
