import { inject } from "@codemation/core";
import { HandlesQuery } from "../../infrastructure/di/HandlesQueryRegistry";
import { QueryHandler } from "../bus/QueryHandler";
import type { CollectionRowDto } from "../contracts/CollectionContracts.types";
import { CollectionRegistry } from "../../infrastructure/collections/CollectionRegistry";
import { CollectionStoreRegistry } from "../../infrastructure/collections/CollectionStoreRegistry";
import { CollectionsTokens } from "../../infrastructure/collections/CollectionsTokens";
import { ApplicationRequestError } from "../ApplicationRequestError";
import { GetCollectionRowQuery } from "./GetCollectionRowQuery";

@HandlesQuery.for(GetCollectionRowQuery)
export class GetCollectionRowQueryHandler extends QueryHandler<GetCollectionRowQuery, CollectionRowDto | null> {
  constructor(
    @inject(CollectionRegistry)
    private readonly collectionRegistry: CollectionRegistry,
    @inject(CollectionsTokens.CollectionStoreRegistry)
    private readonly storeRegistry: CollectionStoreRegistry,
  ) {
    super();
  }

  async execute(query: GetCollectionRowQuery): Promise<CollectionRowDto | null> {
    if (!this.collectionRegistry.has(query.name)) {
      throw new ApplicationRequestError(404, `Collection "${query.name}" not found`);
    }
    const store = this.storeRegistry.get(query.name);
    if (!store) {
      throw new ApplicationRequestError(404, `Collection "${query.name}" has no active store`);
    }
    const row = await store.get(query.id);
    if (!row) {
      return null;
    }
    const { id, created_at, updated_at, ...rest } = row;
    return {
      id,
      created_at: created_at instanceof Date ? created_at.toISOString() : String(created_at),
      updated_at: updated_at instanceof Date ? updated_at.toISOString() : String(updated_at),
      data: rest,
    };
  }
}
