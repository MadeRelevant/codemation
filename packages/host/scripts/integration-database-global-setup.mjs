import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const hostPackageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(hostPackageRoot, "..", "..");
const runner = path.join(hostPackageRoot, "test/http/testkit/IntegrationDatabaseGlobalSetupRunner.ts");
const cachePath = path.join(hostPackageRoot, ".cache", "integration-database.json");

export default function integrationDatabaseGlobalSetup() {
  const result = spawnSync("pnpm", ["exec", "tsx", runner], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error("Integration database global setup failed.");
  }
  if (existsSync(cachePath)) {
    const payload = JSON.parse(readFileSync(cachePath, "utf8"));
    if (payload?.databaseUrl && typeof payload.databaseUrl === "string") {
      process.env.CODEMATION_INTEGRATION_SHARED_DATABASE_URL = payload.databaseUrl;
    }
  }
}
