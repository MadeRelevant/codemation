import { SqliteCollectionAdvisoryLockService } from "./SqliteCollectionAdvisoryLockService";

export class SqliteCollectionAdvisoryLockServiceFactory {
  static create(): SqliteCollectionAdvisoryLockService {
    return new SqliteCollectionAdvisoryLockService();
  }
}
