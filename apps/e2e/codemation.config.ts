import type { CodemationAppContext, CodemationConfig } from "@codemation/host";
import { config as loadDotenv } from "dotenv";
import path from "node:path";

loadDotenv({
  path: path.resolve(import.meta.dirname, ".env"),
  quiet: true,
});

const forceLocalRuntime = process.env.CODEMATION_E2E_FORCE_LOCAL_RUNTIME === "1";
const useRedisRuntime = !forceLocalRuntime && Boolean(process.env.REDIS_URL);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for the e2e consumer app. Configure PostgreSQL in apps/e2e/.env.");
}

/**
 * Fixed consumer used by Playwright and CI only: always require sign-in (no dev auth bypass).
 */
export const codemationHost = {
  app: {
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
    database: {
      url: databaseUrl,
    },
    scheduler: {
      kind: useRedisRuntime ? ("queue" as const) : ("inline" as const),
      queuePrefix: "codemation-e2e",
      workerQueues: ["default"],
      redisUrl: process.env.REDIS_URL,
    },
    whitelabel: {
      productName: "Codemation e2e",
      logoPath: "branding/logo.svg",
    },
  },
  register(app: CodemationAppContext) {
    app.discoverWorkflows("src/workflows/e2e");
  },
} satisfies CodemationConfig;

export default codemationHost;
