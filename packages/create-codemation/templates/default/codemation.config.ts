import type { CodemationAppSlots, CodemationConfig } from "@codemation/host";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StarterLogo } from "./src/ui/StarterLogo";
import { StarterNavigation } from "./src/ui/StarterNavigation";

loadDotenv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".env"),
  quiet: true,
});

const useRedisRuntime = Boolean(process.env.REDIS_URL);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Copy .env.example to .env and set a PostgreSQL connection string.");
}

const slots: CodemationAppSlots = {
  Logo: StarterLogo,
  Navigation: StarterNavigation,
};

export const codemationHost = {
  auth: {
    kind: "local" as const,
    allowUnauthenticatedInDevelopment: true,
  },
  bindings: [],
  workflowDiscovery: {
    directories: ["src/workflows"],
  },
  runtime: {
    database: {
      url: databaseUrl,
    },
    scheduler: {
      kind: useRedisRuntime ? "bullmq" : "local",
      queuePrefix: "codemation-starter",
      workerQueues: ["default"],
    },
    eventBus: {
      kind: useRedisRuntime ? "redis" : "memory",
      redisUrl: process.env.REDIS_URL,
      queuePrefix: "codemation-starter",
    },
  },
  slots,
} satisfies CodemationConfig;

export default codemationHost;
