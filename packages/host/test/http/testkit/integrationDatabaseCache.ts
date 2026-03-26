import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const hostPackageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export const integrationDatabaseCacheFilePath = path.join(hostPackageRoot, ".cache", "integration-database.json");

export type IntegrationDatabaseCachePayload = Readonly<{
  databaseUrl: string;
}>;

export function readIntegrationDatabaseCache(): IntegrationDatabaseCachePayload | null {
  try {
    if (!fs.existsSync(integrationDatabaseCacheFilePath)) {
      return null;
    }
    const raw = fs.readFileSync(integrationDatabaseCacheFilePath, "utf8");
    return JSON.parse(raw) as IntegrationDatabaseCachePayload;
  } catch {
    return null;
  }
}

export function writeIntegrationDatabaseCache(payload: IntegrationDatabaseCachePayload): void {
  fs.mkdirSync(path.dirname(integrationDatabaseCacheFilePath), { recursive: true });
  fs.writeFileSync(integrationDatabaseCacheFilePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}
