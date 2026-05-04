import { inject, injectable } from "@codemation/core";
import { ApplicationRequestError } from "../../../application/ApplicationRequestError";
import type { CommandBus } from "../../../application/bus/CommandBus";
import type { QueryBus } from "../../../application/bus/QueryBus";
import { DeleteCollectionRowCommand } from "../../../application/collections/DeleteCollectionRowCommand";
import { InsertCollectionRowCommand } from "../../../application/collections/InsertCollectionRowCommand";
import { SyncCollectionsCommand } from "../../../application/collections/SyncCollectionsCommand";
import { UpdateCollectionRowCommand } from "../../../application/collections/UpdateCollectionRowCommand";
import { GetCollectionQuery } from "../../../application/collections/GetCollectionQuery";
import { GetCollectionRowQuery } from "../../../application/collections/GetCollectionRowQuery";
import { ListCollectionRowsQuery } from "../../../application/collections/ListCollectionRowsQuery";
import { ListCollectionsQuery } from "../../../application/collections/ListCollectionsQuery";
import { ApplicationTokens } from "../../../applicationTokens";
import { ServerHttpErrorResponseFactory } from "../ServerHttpErrorResponseFactory";
import type { ServerHttpRouteParams } from "../ServerHttpRouteParams";

const DEFAULT_LIMIT = 50;

@injectable()
export class CollectionHttpRouteHandler {
  constructor(
    @inject(ApplicationTokens.QueryBus)
    private readonly queryBus: QueryBus,
    @inject(ApplicationTokens.CommandBus)
    private readonly commandBus: CommandBus,
  ) {}

  async getCollections(): Promise<Response> {
    try {
      return Response.json(await this.queryBus.execute(new ListCollectionsQuery()));
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async getCollection(_request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const name = params.collectionName!;
      const detail = await this.queryBus.execute(new GetCollectionQuery(name));
      if (!detail) {
        return Response.json({ error: `Collection "${name}" not found` }, { status: 404 });
      }
      return Response.json(detail);
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async getCollectionRows(request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const name = params.collectionName!;
      const url = new URL(request.url);
      const limit = this.readInt(url.searchParams.get("limit")) ?? DEFAULT_LIMIT;
      const offset = this.readInt(url.searchParams.get("offset")) ?? 0;
      const where = this.parseWhereParams(url.searchParams);
      const result = await this.queryBus.execute(new ListCollectionRowsQuery(name, limit, offset, where));
      return Response.json(result);
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async getCollectionRow(_request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const name = params.collectionName!;
      const id = params.rowId!;
      const row = await this.queryBus.execute(new GetCollectionRowQuery(name, id));
      if (!row) {
        return Response.json({ error: `Row "${id}" not found in collection "${name}"` }, { status: 404 });
      }
      return Response.json(row);
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async postCollectionRow(request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const name = params.collectionName!;
      const data = await this.readJsonBody<Record<string, unknown>>(request);
      const row = await this.commandBus.execute(new InsertCollectionRowCommand(name, data));
      return Response.json(row, { status: 201 });
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async patchCollectionRow(request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const name = params.collectionName!;
      const id = params.rowId!;
      const patch = await this.readJsonBody<Record<string, unknown>>(request);
      const row = await this.commandBus.execute(new UpdateCollectionRowCommand(name, id, patch));
      return Response.json(row);
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async deleteCollectionRow(_request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const name = params.collectionName!;
      const id = params.rowId!;
      const result = await this.commandBus.execute(new DeleteCollectionRowCommand(name, id));
      return Response.json(result);
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async postSyncCollections(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const dryRun = url.searchParams.has("dryRun") && url.searchParams.get("dryRun") !== "0";
      const result = await this.commandBus.execute(new SyncCollectionsCommand(dryRun));
      return Response.json(result);
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  private parseWhereParams(searchParams: URLSearchParams): Readonly<Record<string, unknown>> | undefined {
    const where: Record<string, unknown> = {};
    for (const [key, value] of searchParams.entries()) {
      const match = /^where\[([^\]]+)\]$/.exec(key);
      if (match) {
        where[match[1]!] = value;
      }
    }
    return Object.keys(where).length > 0 ? where : undefined;
  }

  private readInt(value: string | null): number | undefined {
    if (value === null) {
      return undefined;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
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
