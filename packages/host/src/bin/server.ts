/**
 * Standalone workspace-host entry point.
 *
 * Boots the Codemation framework host process against a consumer workspace mounted at
 * /workspace (default). Reads CODEMATION_CONFIG_PATH for the config file path, defaulting
 * to /workspace/codemation.config.ts.
 *
 * Used by the codemation-workspace-host Docker image (packaging/workspace-host/Dockerfile).
 * auth.kind "managed" is enforced by ManagedModeBootGuard at container-creation time — this
 * entry point does not suppress those errors, so the process will fail-loud with a clear
 * message when required env vars are missing.
 */
import "reflect-metadata";
import { createServer } from "node:http";
import path from "node:path";
import { CodemationConsumerConfigLoader } from "../presentation/server/CodemationConsumerConfigLoader";
import { AppConfigFactory } from "../bootstrap/runtime/AppConfigFactory";
import { AppContainerFactory } from "../bootstrap/AppContainerFactory";
import { FrontendRuntime } from "../bootstrap/runtime/FrontendRuntime";
import { CodemationHonoApiApp } from "../presentation/http/hono/CodemationHonoApiAppFactory";
import { WorkflowWebsocketServer } from "../presentation/websocket/WorkflowWebsocketServer";
import { logLevelPolicyFactory } from "../infrastructure/logging/LogLevelPolicyFactory";
import { ServerLoggerFactory } from "../infrastructure/logging/ServerLoggerFactory";

const logger = new ServerLoggerFactory(logLevelPolicyFactory).create("codemation.server");

const configPath = process.env.CODEMATION_CONFIG_PATH ?? "/workspace/codemation.config.ts";
const consumerRoot = path.dirname(configPath);
const port = Number(process.env.PORT ?? 4001);
const wsPort = Number(process.env.CODEMATION_WS_PORT ?? 4002);

logger.info(`Starting codemation-workspace-host`);
logger.info(`Config: ${configPath}`);
logger.info(`HTTP port: ${port}, WS port: ${wsPort}`);

process.env.CODEMATION_WS_PORT = String(wsPort);
process.env.CODEMATION_CONSUMER_ROOT = consumerRoot;

const configLoader = new CodemationConsumerConfigLoader();
const resolution = await configLoader.load({ consumerRoot, configPathOverride: configPath });

const repoRoot = consumerRoot; // no pnpm workspace root in the image; consumer root is the project
const appConfig = new AppConfigFactory().create({
  repoRoot,
  consumerRoot,
  env: process.env,
  config: resolution.config,
  workflowSources: [...resolution.workflowSources],
});

const websocketServer = new WorkflowWebsocketServer(
  wsPort,
  process.env.CODEMATION_WS_BIND_HOST ?? "0.0.0.0",
  new ServerLoggerFactory(logLevelPolicyFactory).create("codemation-websocket.server"),
);

const container = await new AppContainerFactory().create({ appConfig, sharedWorkflowWebsocketServer: websocketServer });
await container.resolve(FrontendRuntime).start();

const honoApp = container.resolve(CodemationHonoApiApp);

const httpServer = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `127.0.0.1:${port}`}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    // eslint-disable-next-line codemation/no-buffer-everything -- node:http bridge; no streaming alternative when adapting IncomingMessage to Fetch API Request
    const body = chunks.length > 0 ? Buffer.concat(chunks) : null;
    const fetchRequest = new Request(url, {
      method: req.method ?? "GET",
      headers,
      body: body?.byteLength ? body : undefined,
      // @ts-expect-error — Node's Request needs duplex for streaming; required in some runtimes
      duplex: "half",
    });
    Promise.resolve(honoApp.fetch(fetchRequest))
      .then(async (fetchResponse: Response) => {
        const responseHeaders: Record<string, string> = {};
        fetchResponse.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });
        res.writeHead(fetchResponse.status, responseHeaders);
        // eslint-disable-next-line codemation/no-buffer-everything -- node:http bridge; Hono Fetch Response must be fully buffered to write to ServerResponse
        const responseBody = await fetchResponse.arrayBuffer();
        res.end(Buffer.from(responseBody));
      })
      .catch((err: unknown) => {
        logger.error("Unhandled request error", err instanceof Error ? err : new Error(String(err)));
        if (!res.headersSent) {
          res.writeHead(500);
          res.end("Internal server error");
        }
      });
  });
});

httpServer.listen(port, () => {
  logger.info(`codemation-workspace-host listening on port ${port}`);
});
