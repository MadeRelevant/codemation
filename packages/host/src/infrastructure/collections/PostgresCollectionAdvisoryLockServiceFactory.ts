import type { PrismaDatabaseClient } from "../persistence/PrismaDatabaseClient";
import { PostgresCollectionAdvisoryLockService } from "./PostgresCollectionAdvisoryLockService";

export class PostgresCollectionAdvisoryLockServiceFactory {
  static create(prismaClient: PrismaDatabaseClient): PostgresCollectionAdvisoryLockService {
    return new PostgresCollectionAdvisoryLockService(prismaClient);
  }
}
