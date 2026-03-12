import { CodemationConfigFactory, type CodemationAppSlots } from "@codemation/frontend";
import { InMemoryCredentialService, credentialId } from "@codemation/core";
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TestDevBootHook } from "./src/bootstrap/testDevBootHook";
import demoWorkflow from "./src/workflows/demo";
import exampleWorkflow from "./src/workflows/example";
import realtimeWaitWorkflow from "./src/workflows/realtime.wait";
import multiItemsWorkflow from "./src/workflows/multiItems";
import { TestDevLogo } from "./src/ui/testDevLogo";
import { TestDevNavigation } from "./src/ui/testDevNavigation";
import webhookNormal from "./src/workflows/webhook.normal";

loadDotenv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".env"),
});

const OPENAI_API_KEY = credentialId<string>("openai.apiKey");
const configFactory = new CodemationConfigFactory();
const useRedisRuntime = Boolean(process.env.REDIS_URL);
const slots: CodemationAppSlots = {
  Logo: TestDevLogo,
  Navigation: TestDevNavigation,
};

const credentials = new InMemoryCredentialService().setFactory(OPENAI_API_KEY, () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for the OpenAI demo workflow.");
  return apiKey;
});

export const codemationHost = configFactory.define({
  bootHook: TestDevBootHook,
  credentials,
  workflows: [demoWorkflow, exampleWorkflow, realtimeWaitWorkflow, multiItemsWorkflow, webhookNormal],
  runtime: {
    database: {
      url: process.env.DATABASE_URL ?? "sqlite:.codemation/runs.sqlite",
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
});

export default codemationHost;
