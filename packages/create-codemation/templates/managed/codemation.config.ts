import { defineCodemationApp } from "@codemation/host/authoring";
import { config as loadDotenv } from "dotenv";
import path from "node:path";

loadDotenv({
  path: path.resolve(import.meta.dirname, ".env"),
  quiet: true,
});

export default defineCodemationApp({
  name: "Codemation Workspace",
  auth: { kind: "managed" },
  database: { kind: "postgresql", urlEnv: "DATABASE_URL" },
  execution: {
    modeEnv: "CODEMATION_EXECUTION_MODE",
    queuePrefix: "codemation-workspace",
    redisUrlEnv: "REDIS_URL",
  },
  workflowsDir: "./src/workflows",
});
