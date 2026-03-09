import "reflect-metadata";
import path from "node:path";
import { CodemationApplication } from "@codemation/application";
import { InMemoryCredentialService, credentialId } from "@codemation/core";
import { workflows } from "./workflows";

const OPENAI_API_KEY = credentialId<string>("openai.apiKey");
const credentials = new InMemoryCredentialService().setFactory(OPENAI_API_KEY, () => {
  const v = process.env.OPENAI_API_KEY;
  if (!v) throw new Error("Missing env var: OPENAI_API_KEY");
  return v;
});

const repoRoot = path.resolve(process.cwd(), "..", "..");
const app = new CodemationApplication().useWorkflows(workflows).useCredentials(credentials);
const handle = await app.startFrontendMode({ repoRoot });

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await handle.stop();
  } finally {
    // eslint-disable-next-line no-process-exit
    process.exit(signal === "SIGINT" ? 0 : 0);
  }
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGQUIT", () => {
  void shutdown("SIGQUIT");
});

