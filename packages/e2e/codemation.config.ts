import type { CodemationAppSlots, CodemationConfig } from "@codemation/host";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { E2eBootHook } from "./src/bootstrap/E2eBootHook";
import { E2eLogo } from "./src/ui/E2eLogo";
import { E2eNavigation } from "./src/ui/E2eNavigation";

loadDotenv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".env"),
  quiet: true,
});

const useRedisRuntime = Boolean(process.env.REDIS_URL);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for the e2e consumer app. Configure PostgreSQL in packages/e2e/.env.");
}

const slots: CodemationAppSlots = {
  Logo: E2eLogo,
  Navigation: E2eNavigation,
};

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
  slots,
} satisfies CodemationConfig;

export default codemationHost;
