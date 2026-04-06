import fs from "node:fs";
import path from "node:path";
import { PrismaMigrationDeployer } from "../../../src/infrastructure/persistence/PrismaMigrationDeployer";
import { PostgresIntegrationDatabase } from "./PostgresIntegrationDatabase";
import { SqliteIntegrationDatabase } from "./SqliteIntegrationDatabase";
import {
  integrationDatabaseCacheFilePath,
  readIntegrationDatabaseCache,
  writeIntegrationDatabaseCache,
} from "./integrationDatabaseCache";

/**
 * Invoked from Vitest global setup (tsx child process). Provisions one migrated database and
 * writes {@link integrationDatabaseCacheFilePath} for workers / setup files.
 *
 * When {@link process.env.DATABASE_URL} is unset, starts a single Postgres testcontainer and
 * shares it across all integration suites (instead of spawning one container per suite, which is
 * slow and flaky under Docker load).
 */
export class IntegrationDatabaseGlobalSetupRunner {
  private static readonly provisioningLockDir = path.join(
    path.dirname(integrationDatabaseCacheFilePath),
    "integration-database-provisioning.lock",
  );

  private static readonly waitForPeerProvisionMs = 120_000;

  static async run(): Promise<void> {
    const raw = process.env.DATABASE_URL?.trim();
    if (!raw) {
      await IntegrationDatabaseGlobalSetupRunner.provisionSharedPostgresWhenDatabaseUrlUnset();
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

  private static async provisionSharedPostgresWhenDatabaseUrlUnset(): Promise<void> {
    const role = await IntegrationDatabaseGlobalSetupRunner.acquireProvisioningLockOrWaitForPeerCache();
    if (role === "waiter") {
      return;
    }
    try {
      const cached = readIntegrationDatabaseCache();
      if (cached?.databaseUrl) {
        return;
      }
      const { databaseUrl } = await PostgresIntegrationDatabase.provisionSharedForIntegrationGlobalSetup();
      writeIntegrationDatabaseCache({ databaseUrl });
    } finally {
      IntegrationDatabaseGlobalSetupRunner.releaseProvisioningLock();
    }
  }

  /**
   * @returns `"holder"` when this process created the lock dir and must provision and release;
   *   `"waiter"` when another process has already populated the cache (this process skips work).
   */
  private static async acquireProvisioningLockOrWaitForPeerCache(): Promise<"holder" | "waiter"> {
    // Wall-clock deadline for cross-process lock handoff (not a unit-test assertion).
    const deadlineMs =
      // eslint-disable-next-line no-restricted-properties -- real timeout for peer Vitest globalSetup processes
      Date.now() + IntegrationDatabaseGlobalSetupRunner.waitForPeerProvisionMs;
    while (
      // eslint-disable-next-line no-restricted-properties -- real timeout for peer Vitest globalSetup processes
      Date.now() < deadlineMs
    ) {
      const cached = readIntegrationDatabaseCache();
      if (cached?.databaseUrl) {
        return "waiter";
      }
      try {
        fs.mkdirSync(IntegrationDatabaseGlobalSetupRunner.provisioningLockDir);
        return "holder";
      } catch (error: unknown) {
        const code =
          typeof error === "object" && error !== null && "code" in error ? (error as { code: string }).code : undefined;
        if (code !== "EEXIST") {
          throw error;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(
      "Timed out waiting for integration database provisioning from another process (check Docker and .cache/integration-database.json).",
    );
  }

  private static releaseProvisioningLock(): void {
    try {
      fs.rmSync(IntegrationDatabaseGlobalSetupRunner.provisioningLockDir, { recursive: true, force: true });
    } catch {
      // Best-effort: lock may already be gone or another process may own it.
    }
  }
}

export default IntegrationDatabaseGlobalSetupRunner.run;
