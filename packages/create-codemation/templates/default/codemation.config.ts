import { defineCodemationApp } from "@codemation/host/authoring";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import starterHelloWorkflow from "./src/workflows/starter/hello";

loadDotenv({
  path: path.resolve(import.meta.dirname, ".env"),
  quiet: true,
});

const useRedisRuntime = Boolean(process.env.REDIS_URL);
const databaseUrl = process.env.DATABASE_URL?.trim();
if (useRedisRuntime && (!databaseUrl || databaseUrl.length === 0)) {
  throw new Error(
    "DATABASE_URL is required when REDIS_URL is set (BullMQ requires a shared PostgreSQL database). SQLite cannot be used with the BullMQ scheduler.",
  );
}

export const codemationHost = defineCodemationApp({
  name: "My automation",
  auth: {
    kind: "local",
    allowUnauthenticatedInDevelopment: true,
  },
  database: useRedisRuntime
    ? { kind: "postgresql", url: databaseUrl! }
    : { kind: "sqlite", filePath: ".codemation/codemation.sqlite" },
  execution: {
    mode: useRedisRuntime ? "queue" : "inline",
    queuePrefix: "codemation-starter",
    workerQueues: ["default"],
    redisUrl: process.env.REDIS_URL,
  },
  whitelabel: {
    logoPath: "src/branding/logo.svg",
  },
  workflows: [starterHelloWorkflow],
});

export default codemationHost;
