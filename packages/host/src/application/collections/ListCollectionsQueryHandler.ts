import { inject } from "@codemation/core";
import { HandlesQuery } from "../../infrastructure/di/HandlesQueryRegistry";
import { QueryHandler } from "../bus/QueryHandler";
import type { CollectionSummaryDto } from "../contracts/CollectionContracts.types";
import { CollectionRegistry } from "../../infrastructure/collections/CollectionRegistry";
import { ListCollectionsQuery } from "./ListCollectionsQuery";

@HandlesQuery.for(ListCollectionsQuery)
export class ListCollectionsQueryHandler extends QueryHandler<
  ListCollectionsQuery,
  ReadonlyArray<CollectionSummaryDto>
> {
  constructor(
    @inject(CollectionRegistry)
    private readonly collectionRegistry: CollectionRegistry,
  ) {
    super();
  }

  async execute(_query: ListCollectionsQuery): Promise<ReadonlyArray<CollectionSummaryDto>> {
    return this.collectionRegistry.list().map((def) => ({
      name: def.name,
      fieldCount: Object.keys(def.fields).length,
    }));
  }
}
