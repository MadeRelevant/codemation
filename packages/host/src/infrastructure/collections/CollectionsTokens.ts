import type { TypeToken } from "@codemation/core";
import type { CollectionRegistry } from "./CollectionRegistry";
import type { CollectionSchemaSyncer } from "./CollectionSchemaSyncer";
import type { CollectionStoreRegistry } from "./CollectionStoreRegistry";

export const CollectionsTokens = {
  CollectionRegistry: Symbol.for("codemation.collections.CollectionRegistry") as TypeToken<CollectionRegistry>,
  CollectionStoreRegistry: Symbol.for(
    "codemation.collections.CollectionStoreRegistry",
  ) as TypeToken<CollectionStoreRegistry>,
  CollectionSchemaSyncer: Symbol.for(
    "codemation.collections.CollectionSchemaSyncer",
  ) as TypeToken<CollectionSchemaSyncer>,
} as const;
