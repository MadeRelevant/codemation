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
const databaseUrl = process.env.DATABASE_URL?.trim();
if (useRedisRuntime && (!databaseUrl || databaseUrl.length === 0)) {
  throw new Error(
    "DATABASE_URL is required when REDIS_URL is set (BullMQ requires a shared PostgreSQL database). PGlite cannot be used with the BullMQ scheduler.",
  );
}

const slots: CodemationAppSlots = {
  Logo: StarterLogo,
  Navigation: StarterNavigation,
};

export const codemationHost = {
  auth: {
    kind: "local" as const,
    allowUnauthenticatedInDevelopment: true,
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
    directories: ["src/workflows"],
  },
  runtime: {
    database: useRedisRuntime
      ? { kind: "postgresql" as const, url: databaseUrl! }
      : { kind: "pglite" as const, pgliteDataDir: ".codemation/pglite" },
    scheduler: {
      kind: useRedisRuntime ? "bullmq" : "local",
      queuePrefix: "codemation-minimal",
      workerQueues: ["default"],
    },
    eventBus: {
      kind: useRedisRuntime ? "redis" : "memory",
      redisUrl: process.env.REDIS_URL,
      queuePrefix: "codemation-minimal",
    },
  },
  slots,
} satisfies CodemationConfig;

export default codemationHost;
