import { defineCodemationApp } from "@codemation/host/authoring";
import { config as loadDotenv } from "dotenv";
import path from "node:path";

loadDotenv({
  path: path.resolve(import.meta.dirname, ".env"),
  quiet: true,
});

// NOTE: `auth.kind: "managed"` will be recognized once Story 2 (sprint3/story-2-workspace-managed-auth)
// merges. Until then, the cast suppresses the type error. Remove the cast after the merge.
export default defineCodemationApp({
  name: "Codemation Workspace",
  auth: { kind: "managed" as "local" },
  database: { kind: "postgresql", urlEnv: "DATABASE_URL" },
  execution: {
    modeEnv: "CODEMATION_EXECUTION_MODE",
    queuePrefix: "codemation-workspace",
    redisUrlEnv: "REDIS_URL",
  },
  workflowsDir: "./src/workflows",
});
