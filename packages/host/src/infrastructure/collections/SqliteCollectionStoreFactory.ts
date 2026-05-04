import type { CollectionDefinition } from "@codemation/core";
import type { PrismaDatabaseClient } from "../persistence/PrismaDatabaseClient";
import { SqliteCollectionStore } from "./SqliteCollectionStore";

export class SqliteCollectionStoreFactory {
  constructor(private readonly prismaClient: PrismaDatabaseClient) {}

  createStore(definition: CollectionDefinition): SqliteCollectionStore {
    return new SqliteCollectionStore(definition, this.prismaClient);
  }
}
