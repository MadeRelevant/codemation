import type { PrismaDatabaseClient } from "../persistence/PrismaDatabaseClient";
import { PostgresCollectionSchemaIntrospector } from "./PostgresCollectionSchemaIntrospector";

export class PostgresCollectionSchemaIntrospectorFactory {
  static create(prismaClient: PrismaDatabaseClient): PostgresCollectionSchemaIntrospector {
    return new PostgresCollectionSchemaIntrospector(prismaClient);
  }
}
