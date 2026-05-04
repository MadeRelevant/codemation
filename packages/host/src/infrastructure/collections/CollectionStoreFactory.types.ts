import type { CollectionDefinition } from "@codemation/core";
import type { CollectionStoreRegistry } from "./CollectionStoreRegistry";

/**
 * Builds a CollectionStoreRegistry from the declared CollectionRegistry.
 * Driver-specific implementations build stores for each collection.
 */
export interface CollectionStoreRegistryFactory {
  create(): CollectionStoreRegistry;
}

/**
 * Builds a single store for a given collection definition.
 * Implementations use $queryRawUnsafe / $executeRawUnsafe on the injected Prisma client.
 */
export interface CollectionStoreFactory {
  createStore(definition: CollectionDefinition): unknown;
}
