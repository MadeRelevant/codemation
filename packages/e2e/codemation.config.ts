import type { CodemationConfig } from "@codemation/host";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { E2eBootHook } from "./src/bootstrap/E2eBootHook";

const consumerRoot = process.env.CODEMATION_CONSUMER_ROOT?.trim() || process.cwd();

loadDotenv({
  path: path.resolve(consumerRoot, ".env"),
  quiet: true,
});

const forceLocalRuntime = process.env.CODEMATION_E2E_FORCE_LOCAL_RUNTIME === "1";
const useRedisRuntime = !forceLocalRuntime && Boolean(process.env.REDIS_URL);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for the e2e consumer app. Configure PostgreSQL in packages/e2e/.env.");
}

/**
 * Fixed consumer used by Playwright and CI only: always require sign-in (no dev auth bypass).
 */
export const codemationHost = {
  auth: {
    kind: "local" as const,
    allowUnauthenticatedInDevelopment: false,
    oauth: [
      {
        provider: "google",
        clientIdEnv: "GOOGLE_CLIENT_ID",
        clientSecretEnv: "GOOGLE_CLIENT_SECRET",
      },
    ],
  },
  bindings: [],
  workflowDiscovery: {
    directories: ["src/workflows/e2e"],
  },
  bootHook: E2eBootHook,
  runtime: {
    database: {
      url: databaseUrl,
    },
    scheduler: {
      kind: useRedisRuntime ? "bullmq" : "local",
      queuePrefix: "codemation-e2e",
      workerQueues: ["default"],
    },
    eventBus: {
      kind: useRedisRuntime ? "redis" : "memory",
      redisUrl: process.env.REDIS_URL,
      queuePrefix: "codemation-e2e",
    },
  },
  whitelabel: {
    productName: "Codemation e2e",
    logoPath: "branding/logo.svg",
  },
} satisfies CodemationConfig;

export default codemationHost;
