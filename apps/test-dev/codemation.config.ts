import type { CodemationAppSlots, CodemationConfig } from "@codemation/frontend";
import { InMemoryCredentialService, credentialId } from "@codemation/core";
import type { GmailServiceAccountCredential } from "@codemation/core-nodes-gmail";
import { GmailNodes } from "@codemation/core-nodes-gmail";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TestDevGmailEnvironment } from "./src/bootstrap/TestDevGmailEnvironment";
import { TestDevMailKeywordCatalog } from "./src/bootstrap/TestDevMailKeywordCatalog";
import { TestDevOdooEnvironment } from "./src/bootstrap/TestDevOdooEnvironment";
import { TestDevLogo } from "./src/ui/testDevLogo";
import { TestDevNavigation } from "./src/ui/testDevNavigation";

loadDotenv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".env"),
});

const OPENAI_API_KEY = credentialId<string>("openai.apiKey");
const GMAIL_SERVICE_ACCOUNT = credentialId<GmailServiceAccountCredential>("gmail.serviceAccount");
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

const credentials = new InMemoryCredentialService()
  .setFactory(OPENAI_API_KEY, () => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for the OpenAI demo workflow.");
    return apiKey;
  })
  .setFactory(GMAIL_SERVICE_ACCOUNT, () => gmailEnvironment.resolveCredential());

export const codemationHost = {
  credentials,
  bindings: [
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
