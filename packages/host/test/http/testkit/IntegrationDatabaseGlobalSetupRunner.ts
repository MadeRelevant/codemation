import { PrismaMigrationDeployer } from "../../../src/infrastructure/persistence/PrismaMigrationDeployer";
import { PgliteIntegrationDatabase } from "./PgliteIntegrationDatabase";
import { PostgresIntegrationDatabase } from "./PostgresIntegrationDatabase";
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
  if (raw.startsWith("pglite:")) {
    const dataDir = PgliteIntegrationDatabase.parsePgliteDataDirFromUrl(raw, process.cwd());
    process.env.CODEMATION_HOST_PACKAGE_ROOT = PgliteIntegrationDatabase.resolveHostPackageRoot();
    await new PrismaMigrationDeployer().deployPersistence({ kind: "pglite", dataDir }, process.env);
    writeIntegrationDatabaseCache({ databaseUrl: raw });
    return;
  }
  const { databaseUrl } = await PostgresIntegrationDatabase.provisionSharedForIntegrationGlobalSetup();
  writeIntegrationDatabaseCache({ databaseUrl });
}
