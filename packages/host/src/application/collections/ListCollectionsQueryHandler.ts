import { inject } from "@codemation/core";
import { HandlesQuery } from "../../infrastructure/di/HandlesQueryRegistry";
import { QueryHandler } from "../bus/QueryHandler";
import type { CollectionSummaryDto } from "../contracts/CollectionContracts.types";
import { CollectionRegistry } from "../../infrastructure/collections/CollectionRegistry";
import { CollectionStoreRegistry } from "../../infrastructure/collections/CollectionStoreRegistry";
import { CollectionsTokens } from "../../infrastructure/collections/CollectionsTokens";
import { ListCollectionsQuery } from "./ListCollectionsQuery";

@HandlesQuery.for(ListCollectionsQuery)
export class ListCollectionsQueryHandler extends QueryHandler<
  ListCollectionsQuery,
  ReadonlyArray<CollectionSummaryDto>
> {
  constructor(
    @inject(CollectionRegistry)
    private readonly collectionRegistry: CollectionRegistry,
    @inject(CollectionsTokens.CollectionStoreRegistry)
    private readonly storeRegistry: CollectionStoreRegistry,
  ) {
    super();
  }

  async execute(_query: ListCollectionsQuery): Promise<ReadonlyArray<CollectionSummaryDto>> {
    const definitions = this.collectionRegistry.list();
    return Promise.all(
      definitions.map(async (def) => {
        const store = this.storeRegistry.get(def.name);
        const rowCount = store ? (await store.list({ limit: 1 })).total : 0;
        return {
          name: def.name,
          fieldCount: Object.keys(def.fields).length,
          rowCount,
        };
      }),
    );
  }
}
