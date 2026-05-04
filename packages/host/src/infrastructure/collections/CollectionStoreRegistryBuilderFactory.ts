import type { ExecutionContext } from "@codemation/core";
import type { AppConfig } from "../../presentation/config/AppConfig";
import type { PrismaDatabaseClient } from "../persistence/PrismaDatabaseClient";
import type { CollectionRegistry } from "./CollectionRegistry";
import { CollectionStoreRegistry } from "./CollectionStoreRegistry";
import { PostgresCollectionStoreFactory } from "./PostgresCollectionStoreFactory";
import { SqliteCollectionStoreFactory } from "./SqliteCollectionStoreFactory";

type CollectionStore = NonNullable<ExecutionContext["collections"]>[string];

/**
 * Builds a CollectionStoreRegistry by creating a store per declared collection.
 * Driver selection is based on appConfig.persistence.kind.
 *
 * Named "Builder" (not "Factory") to avoid confusion with the per-collection store factories.
 * Ends in "Factory" because the file creates instances — this satisfies the composition-root suffix rule.
 */
export class CollectionStoreRegistryBuilderFactory {
  static create(
    appConfig: AppConfig,
    collectionRegistry: CollectionRegistry,
    prismaClient: PrismaDatabaseClient,
  ): CollectionStoreRegistry {
    const kind = appConfig.persistence.kind;
    if (kind === "none") {
      return new CollectionStoreRegistry(new Map());
    }

    const storeFactory =
      kind === "postgresql"
        ? new PostgresCollectionStoreFactory(prismaClient)
        : new SqliteCollectionStoreFactory(prismaClient);

    const stores = new Map<string, CollectionStore>();
    for (const definition of collectionRegistry.list()) {
      stores.set(definition.name, storeFactory.createStore(definition) as CollectionStore);
    }

    return new CollectionStoreRegistry(stores);
  }
}
