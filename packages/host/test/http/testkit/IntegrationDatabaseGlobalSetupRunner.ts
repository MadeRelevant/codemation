import { PrismaMigrationDeployer } from "../../../src/infrastructure/persistence/PrismaMigrationDeployer";
import { PostgresIntegrationDatabase } from "./PostgresIntegrationDatabase";
import { SqliteIntegrationDatabase } from "./SqliteIntegrationDatabase";
import { writeIntegrationDatabaseCache } from "./integrationDatabaseCache";

/**
 * Invoked from Vitest global setup (tsx child process). Provisions one migrated database and
 * writes {@link integrationDatabaseCacheFilePath} for workers / setup files.
 */
export default async function runIntegrationDatabaseGlobalSetup(): Promise<void> {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    return;
  }
  if (raw.startsWith("file:")) {
    const databaseFilePath = SqliteIntegrationDatabase.parseSqliteFilePathFromUrl(raw);
    process.env.CODEMATION_HOST_PACKAGE_ROOT = SqliteIntegrationDatabase.resolveHostPackageRoot();
    await new PrismaMigrationDeployer().deployPersistence({ kind: "sqlite", databaseFilePath }, process.env);
    writeIntegrationDatabaseCache({ databaseUrl: raw });
    return;
  }
  const { databaseUrl } = await PostgresIntegrationDatabase.provisionSharedForIntegrationGlobalSetup();
  writeIntegrationDatabaseCache({ databaseUrl });
}
