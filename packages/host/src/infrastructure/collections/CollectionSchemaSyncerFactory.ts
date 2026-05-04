import type { Logger } from "../../application/logging/Logger";
import type { AppConfig } from "../../presentation/config/AppConfig";
import type { PrismaDatabaseClient } from "../persistence/PrismaDatabaseClient";
import { PostgresCollectionAdvisoryLockServiceFactory } from "./PostgresCollectionAdvisoryLockServiceFactory";
import { PostgresCollectionDdlEmitterFactory } from "./PostgresCollectionDdlEmitterFactory";
import { PostgresCollectionSchemaIntrospectorFactory } from "./PostgresCollectionSchemaIntrospectorFactory";
import { SqliteCollectionAdvisoryLockServiceFactory } from "./SqliteCollectionAdvisoryLockServiceFactory";
import { SqliteCollectionDdlEmitterFactory } from "./SqliteCollectionDdlEmitterFactory";
import { SqliteCollectionSchemaIntrospectorFactory } from "./SqliteCollectionSchemaIntrospectorFactory";
import { CollectionRegistry } from "./CollectionRegistry";
import { CollectionSchemaDiffer } from "./CollectionSchemaDiffer";
import { CollectionSchemaSyncer } from "./CollectionSchemaSyncer";

/**
 * Composition root for CollectionSchemaSyncer.
 * Selects driver implementations based on appConfig.persistence.kind.
 */
export class CollectionSchemaSyncerFactory {
  static create(
    appConfig: AppConfig,
    collectionRegistry: CollectionRegistry,
    prismaClient: PrismaDatabaseClient,
    logger: Logger,
  ): CollectionSchemaSyncer {
    const differ = new CollectionSchemaDiffer();

    if (appConfig.persistence.kind === "postgresql") {
      return new CollectionSchemaSyncer(
        collectionRegistry,
        PostgresCollectionSchemaIntrospectorFactory.create(prismaClient),
        differ,
        PostgresCollectionDdlEmitterFactory.create(),
        PostgresCollectionAdvisoryLockServiceFactory.create(prismaClient),
        prismaClient,
        logger,
        appConfig.env,
      );
    }

    if (appConfig.persistence.kind === "sqlite") {
      return new CollectionSchemaSyncer(
        collectionRegistry,
        SqliteCollectionSchemaIntrospectorFactory.create(prismaClient),
        differ,
        SqliteCollectionDdlEmitterFactory.create(),
        SqliteCollectionAdvisoryLockServiceFactory.create(),
        prismaClient,
        logger,
        appConfig.env,
      );
    }

    throw new Error(
      `CollectionSchemaSyncerFactory: persistence kind "${appConfig.persistence.kind}" is not supported for collection schema sync. Only "postgresql" and "sqlite" are supported.`,
    );
  }
}
