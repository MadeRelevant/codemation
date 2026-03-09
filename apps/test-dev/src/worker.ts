import "reflect-metadata";
import { CodemationApplication } from "@codemation/application";
import { InMemoryCredentialService, credentialId } from "@codemation/core";
import { workflows } from "./workflows";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error("Missing env var: REDIS_URL");

const queuePrefix = process.env.QUEUE_PREFIX ?? "codemation";
const queues = (process.env.WORKER_QUEUES ?? "default")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const OPENAI_API_KEY = credentialId<string>("openai.apiKey");
const credentials = new InMemoryCredentialService().setFactory(OPENAI_API_KEY, () => {
  const v = process.env.OPENAI_API_KEY;
  if (!v) throw new Error("Missing env var: OPENAI_API_KEY");
  return v;
});

// eslint-disable-next-line no-console
console.log(`[worker] connected to ${redisUrl}; queues=${queues.join(",")}`);

const dbPath = process.env.CODEMATION_DB_PATH ?? "./.codemation/runs.sqlite";
const app = new CodemationApplication().useWorkflows(workflows).useCredentials(credentials);
const handle = await app.startWorkerMode({ redisUrl, queuePrefix, queues, dbPath });

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await handle.stop();
  } finally {
    // eslint-disable-next-line no-process-exit
    process.exit(0);
  }
};

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});

