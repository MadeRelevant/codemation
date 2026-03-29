import type { CodemationAppContext, CodemationConfig } from "@codemation/host";
import { config as loadDotenv } from "dotenv";
import path from "node:path";

loadDotenv({
  path: path.resolve(import.meta.dirname, ".env"),
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
  app: {
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
    database: useRedisRuntime
      ? { kind: "postgresql" as const, url: databaseUrl! }
      : { kind: "pglite" as const, pgliteDataDir: ".codemation/pglite" },
    scheduler: {
      kind: useRedisRuntime ? ("queue" as const) : ("inline" as const),
      queuePrefix: "codemation-minimal",
      workerQueues: ["default"],
      redisUrl: process.env.REDIS_URL,
    },
    whitelabel: {
      productName: "My automation",
      logoPath: "src/branding/logo.svg",
    },
  },
  register(app: CodemationAppContext) {
    app.discoverWorkflows("src/workflows");
  },
} satisfies CodemationConfig;

export default codemationHost;
