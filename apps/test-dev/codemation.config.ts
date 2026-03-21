import { GmailNodes } from "@codemation/core-nodes-gmail";
import type { CodemationAppSlots,CodemationConfig } from "@codemation/host";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TestDevCredentialBootstrap } from "./src/bootstrap/TestDevCredentialBootstrap";
import { TestDevGmailEnvironment } from "./src/bootstrap/TestDevGmailEnvironment";
import { TestDevMailKeywordCatalog } from "./src/bootstrap/TestDevMailKeywordCatalog";
import { TestDevOdooEnvironment } from "./src/bootstrap/TestDevOdooEnvironment";
import { TestDevLogo } from "./src/ui/testDevLogo";
import { TestDevNavigation } from "./src/ui/testDevNavigation";

loadDotenv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".env"),
});

const useRedisRuntime = Boolean(process.env.REDIS_URL);
const databaseUrl = process.env.DATABASE_URL;
const gmailEnvironment = new TestDevGmailEnvironment();
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for the test-dev app. Configure a PostgreSQL connection string in apps/test-dev/.env.");
}
const slots: CodemationAppSlots = {
  Logo: TestDevLogo,
  Navigation: TestDevNavigation,
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
  bindings: [
    {
      token: TestDevGmailEnvironment,
      useValue: gmailEnvironment,
    },
    {
      token: TestDevMailKeywordCatalog,
      useValue: new TestDevMailKeywordCatalog(["RFQ", "QUOTE", "QUOTATION", "RFP"]),
    },
    {
      token: TestDevOdooEnvironment,
      useValue: new TestDevOdooEnvironment("https://demo.odoo.test"),
    },
  ],
  workflowDiscovery: {
    directories: ["src/workflows"],
  },
  plugins: [
    new GmailNodes(),
  ],
  bootHook: TestDevCredentialBootstrap,
  runtime: {
    database: {
      url: databaseUrl,
    },
    scheduler: {
      kind: useRedisRuntime ? "bullmq" : "local",
      queuePrefix: "codemation",
      workerQueues: ["default"],
    },
    eventBus: {
      kind: useRedisRuntime ? "redis" : "memory",
      redisUrl: process.env.REDIS_URL,
      queuePrefix: "codemation",
    },
  },
  slots,
} satisfies CodemationConfig;

export default codemationHost;
