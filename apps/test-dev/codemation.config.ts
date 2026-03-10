import { CodemationConfigFactory } from "@codemation/application";
import { InMemoryCredentialService, credentialId } from "@codemation/core";
import { TestDevBootHook } from "./src/bootstrap/testDevBootHook";
import exampleWorkflow from "./src/workflows/example";

const OPENAI_API_KEY = credentialId<string>("openai.apiKey");
const configFactory = new CodemationConfigFactory();
const useRedisRuntime = Boolean(process.env.REDIS_URL);

const credentials = new InMemoryCredentialService().setFactory(OPENAI_API_KEY, () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for the OpenAI demo workflow.");
  return apiKey;
});

export default configFactory.define({
  bootHook: TestDevBootHook,
  credentials,
  discovery: {
    consumerModuleRoots: ["src"],
    workflowSource: "config-only",
  },
  workflows: [exampleWorkflow],
  workflowMode: "replace",
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
});
