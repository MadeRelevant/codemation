import { defineCodemationApp } from "@codemation/host";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import helloWorkflow from "./src/workflows/hello";

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

export const codemationHost = defineCodemationApp({
  name: "My automation",
  auth: {
    kind: "local",
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
    ? { kind: "postgresql", url: databaseUrl! }
    : { kind: "pglite", dataDir: ".codemation/pglite" },
  execution: {
    mode: useRedisRuntime ? "queue" : "inline",
    queuePrefix: "codemation-minimal",
    workerQueues: ["default"],
    redisUrl: process.env.REDIS_URL,
  },
  whitelabel: {
    logoPath: "src/branding/logo.svg",
  },
  workflows: [helloWorkflow],
});

export default codemationHost;
