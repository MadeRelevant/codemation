import type { PrismaDatabaseClient } from "../persistence/PrismaDatabaseClient";
import { SqliteCollectionSchemaIntrospector } from "./SqliteCollectionSchemaIntrospector";

export class SqliteCollectionSchemaIntrospectorFactory {
  static create(prismaClient: PrismaDatabaseClient): SqliteCollectionSchemaIntrospector {
    return new SqliteCollectionSchemaIntrospector(prismaClient);
  }
}
