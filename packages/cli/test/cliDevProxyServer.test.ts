import assert from "node:assert/strict";
import { createServer, type Server as HttpServer } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, test } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import { ApiPaths } from "@codemation/host";

import { CliDevProxyServer } from "../src/dev/CliDevProxyServer";

class StubRuntimeServer {
  private apiServer: HttpServer | null = null;
  private websocketServer: HttpServer | null = null;
  private workflowSocketServer: WebSocketServer | null = null;
  private _httpPort = 0;
  private _workflowPort = 0;

  constructor(private readonly responseBody: string) {}

  get httpPort(): number {
    return this._httpPort;
  }

  get workflowPort(): number {
    return this._workflowPort;
  }

  async start(): Promise<void> {
    this.apiServer = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end(this.responseBody);
    });
    this.websocketServer = createServer();
    this.workflowSocketServer = new WebSocketServer({
      server: this.websocketServer,
      path: ApiPaths.workflowWebsocket(),
    });
    this.workflowSocketServer.on("connection", (socket: WebSocket) => {
      socket.send(JSON.stringify({ kind: "ready" }));
    });
    await Promise.all([this.listenServer(this.apiServer), this.listenServer(this.websocketServer)]);
    this._httpPort = (this.apiServer.address() as AddressInfo).port;
    this._workflowPort = (this.websocketServer.address() as AddressInfo).port;
  }

  async stop(): Promise<void> {
    await Promise.all([
      this.closeWorkflowSocketServer(),
      this.closeServer(this.apiServer),
      this.closeServer(this.websocketServer),
    ]);
    this.apiServer = null;
    this.websocketServer = null;
    this.workflowSocketServer = null;
  }

  private listenServer(server: HttpServer): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        resolve();
      });
    });
  }

  private closeWorkflowSocketServer(): Promise<void> {
    const workflowSocketServer = this.workflowSocketServer;
    if (!workflowSocketServer) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      workflowSocketServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private closeServer(server: HttpServer | null): Promise<void> {
    if (!server) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

class ProxyHarness {
  proxyServer: CliDevProxyServer | null = null;
  private baseUrl = "";

  async start(): Promise<void> {
    const probeServer = createServer();
    await new Promise<void>((resolve) => {
      probeServer.listen(0, "127.0.0.1", () => resolve());
    });
    const port = (probeServer.address() as AddressInfo).port;
    await new Promise<void>((resolve, reject) => {
      probeServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.proxyServer = new CliDevProxyServer(port);
    await this.proxyServer.start();
  }

  async stop(): Promise<void> {
    if (this.proxyServer) {
      await this.proxyServer.stop();
      this.proxyServer = null;
    }
  }

  async fetchApi(pathname: string): Promise<Response> {
    return await fetch(`${this.baseUrl}${pathname}`);
  }
}

const activeRuntimes: StubRuntimeServer[] = [];
const activeHarnesses: ProxyHarness[] = [];

afterEach(async () => {
  await Promise.all(activeHarnesses.map(async (harness) => await harness.stop()));
  activeHarnesses.length = 0;
  await Promise.all(activeRuntimes.map(async (runtime) => await runtime.stop()));
  activeRuntimes.length = 0;
});

test("CliDevProxyServer holds traffic during rebuilds and swaps to the latest runtime", async () => {
  const harness = new ProxyHarness();
  activeHarnesses.push(harness);
  await harness.start();
  assert.ok(harness.proxyServer);

  const initialResponse = await harness.fetchApi("/api/example");
  assert.equal(initialResponse.status, 503);

  const runtimeA = new StubRuntimeServer("runtime-a");
  activeRuntimes.push(runtimeA);
  await runtimeA.start();
  await harness.proxyServer.activateRuntime({
    httpPort: runtimeA.httpPort,
    workflowWebSocketPort: runtimeA.workflowPort,
  });

  const runtimeAResponse = await harness.fetchApi("/api/example");
  assert.equal(runtimeAResponse.status, 200);
  assert.equal(await runtimeAResponse.text(), "runtime-a");

  harness.proxyServer.setBuildStatus("building");
  const rebuildingResponse = await harness.fetchApi("/api/example");
  assert.equal(rebuildingResponse.status, 503);

  const runtimeB = new StubRuntimeServer("runtime-b");
  activeRuntimes.push(runtimeB);
  await runtimeB.start();
  await harness.proxyServer.activateRuntime({
    httpPort: runtimeB.httpPort,
    workflowWebSocketPort: runtimeB.workflowPort,
  });
  harness.proxyServer.setBuildStatus("idle");

  const runtimeBResponse = await harness.fetchApi("/api/example");
  assert.equal(runtimeBResponse.status, 200);
  assert.equal(await runtimeBResponse.text(), "runtime-b");
});
