import { defineCodemationApp } from "@codemation/host/authoring";
import { config as loadDotenv } from "dotenv";
import path from "node:path";

loadDotenv({
  path: path.resolve(import.meta.dirname, ".env"),
  quiet: true,
});

export default defineCodemationApp({
  name: "Codemation Workspace",
  codemationVersion: "1.0.0",
  auth: { kind: "managed" },
  database: { kind: "sqlite", filePath: ".codemation/codemation.sqlite" },
  execution: {
    modeEnv: "CODEMATION_EXECUTION_MODE",
    queuePrefix: "codemation-workspace",
    redisUrlEnv: "REDIS_URL",
  },
  workflowsDir: "./src/workflows",
});
