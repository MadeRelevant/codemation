import type { CodemationConfig } from "@codemation/host";
import { config as loadDotenv } from "dotenv";
import path from "node:path";

const consumerRoot = process.env.CODEMATION_CONSUMER_ROOT?.trim() || process.cwd();

loadDotenv({
  path: path.resolve(consumerRoot, ".env"),
  quiet: true,
});

const useRedisRuntime = Boolean(process.env.REDIS_URL);
const databaseUrl = process.env.DATABASE_URL?.trim();
if (useRedisRuntime && (!databaseUrl || databaseUrl.length === 0)) {
  throw new Error(
    "DATABASE_URL is required when REDIS_URL is set (BullMQ requires a shared PostgreSQL database). PGlite cannot be used with the BullMQ scheduler.",
  );
}

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
    database: useRedisRuntime
      ? { kind: "postgresql" as const, url: databaseUrl! }
      : { kind: "pglite" as const, pgliteDataDir: ".codemation/pglite" },
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
  whitelabel: {
    productName: "My automation",
    logoPath: "src/branding/logo.svg",
  },
} satisfies CodemationConfig;

export default codemationHost;
