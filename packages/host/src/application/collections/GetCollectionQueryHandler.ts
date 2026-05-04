import { inject } from "@codemation/core";
import { HandlesQuery } from "../../infrastructure/di/HandlesQueryRegistry";
import { QueryHandler } from "../bus/QueryHandler";
import type { CollectionDetailDto } from "../contracts/CollectionContracts.types";
import { CollectionRegistry } from "../../infrastructure/collections/CollectionRegistry";
import { GetCollectionQuery } from "./GetCollectionQuery";

@HandlesQuery.for(GetCollectionQuery)
export class GetCollectionQueryHandler extends QueryHandler<GetCollectionQuery, CollectionDetailDto | null> {
  constructor(
    @inject(CollectionRegistry)
    private readonly collectionRegistry: CollectionRegistry,
  ) {
    super();
  }

  async execute(query: GetCollectionQuery): Promise<CollectionDetailDto | null> {
    const def = this.collectionRegistry.resolve(query.name);
    if (!def) {
      return null;
    }
    return {
      name: def.name,
      fields: Object.entries(def.fields).map(([name, field]) => ({
        name,
        type: field.type,
        nullable: field.nullable,
        hasDefault: field.default !== undefined,
      })),
      indexes: def.indexes.map((idx) => ({
        fields: [...idx.on],
        unique: idx.unique ?? false,
      })),
    };
  }
}
