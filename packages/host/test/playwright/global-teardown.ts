import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PostgresIntegrationDatabase,
  type PostgresIntegrationDatabaseSnapshot,
} from "../http/testkit/PostgresIntegrationDatabase";

const playwrightDir = path.dirname(fileURLToPath(import.meta.url));
const snapshotPath = path.join(playwrightDir, ".e2e-db-snapshot.json");

export default async function globalTeardown(): Promise<void> {
  if (!fs.existsSync(snapshotPath)) {
    return;
  }
  try {
    const raw = fs.readFileSync(snapshotPath, "utf8");
    const snapshot = JSON.parse(raw) as PostgresIntegrationDatabaseSnapshot;
    await PostgresIntegrationDatabase.teardownSnapshot(snapshot);
  } finally {
    fs.unlinkSync(snapshotPath);
  }
}
