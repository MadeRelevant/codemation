import type { CollectionDefinition } from "@codemation/core";
import type { PrismaDatabaseClient } from "../persistence/PrismaDatabaseClient";
import { PostgresCollectionStore } from "./PostgresCollectionStore";

export class PostgresCollectionStoreFactory {
  constructor(private readonly prismaClient: PrismaDatabaseClient) {}

  createStore(definition: CollectionDefinition): PostgresCollectionStore {
    return new PostgresCollectionStore(definition, this.prismaClient);
  }
}
