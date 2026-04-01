import assert from "node:assert/strict";
import { createServer, type Server as HttpServer } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, test } from "vitest";
import WebSocket, { WebSocketServer } from "ws";
import { ApiPaths } from "@codemation/host";

import { CliDevProxyServer } from "../src/dev/CliDevProxyServer";
import { ListenPortConflictDescriber } from "../src/dev/ListenPortConflictDescriber";

class StubListenPortConflictDescriber extends ListenPortConflictDescriber {
  constructor(private readonly description: string | null) {
    super("linux");
  }

  override async describeLoopbackPort(_port: number): Promise<string | null> {
    return this.description;
  }
}

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

class StubUiServer {
  private server: HttpServer | null = null;
  private _port = 0;

  get port(): number {
    return this._port;
  }

  async start(): Promise<void> {
    this.server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("ui-ok");
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(0, "127.0.0.1", () => {
        resolve();
      });
    });
    this._port = (this.server.address() as AddressInfo).port;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    this.server = null;
  }
}

class ProxyHarness {
  proxyServer: CliDevProxyServer | null = null;
  private baseUrl = "";
  private readonly listenPortConflictDescriber = new StubListenPortConflictDescriber(null);

  get httpBaseUrl(): string {
    return this.baseUrl;
  }

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
    this.proxyServer = new CliDevProxyServer(port, this.listenPortConflictDescriber);
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
const activeUiServers: StubUiServer[] = [];

afterEach(async () => {
  await Promise.all(activeHarnesses.map(async (harness) => await harness.stop()));
  activeHarnesses.length = 0;
  await Promise.all(activeRuntimes.map(async (runtime) => await runtime.stop()));
  activeRuntimes.length = 0;
  await Promise.all(activeUiServers.map(async (ui) => await ui.stop()));
  activeUiServers.length = 0;
});

async function waitFor(predicate: () => boolean, maxAttempts = 500): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("waitFor timed out");
}

function toWebSocketHttpUrl(httpBaseUrl: string): string {
  return httpBaseUrl.replace(/^http:/, "ws:");
}

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
  const bootstrapSummaryWhileBuilding = await harness.fetchApi("/api/dev/bootstrap-summary");
  assert.equal(bootstrapSummaryWhileBuilding.status, 200);
  assert.equal(await bootstrapSummaryWhileBuilding.text(), "runtime-b");
  harness.proxyServer.setBuildStatus("idle");

  const runtimeBResponse = await harness.fetchApi("/api/example");
  assert.equal(runtimeBResponse.status, 200);
  assert.equal(await runtimeBResponse.text(), "runtime-b");
});

test("CliDevProxyServer start includes listener details when the port is already in use", async () => {
  const occupiedServer = createServer();
  await new Promise<void>((resolve, reject) => {
    occupiedServer.once("error", reject);
    occupiedServer.listen(0, "127.0.0.1", () => resolve());
  });
  const occupiedPort = (occupiedServer.address() as AddressInfo).port;
  const proxyServer = new CliDevProxyServer(
    occupiedPort,
    new StubListenPortConflictDescriber("pid=4242 command=next-server endpoint=TCP 127.0.0.1:3000 (LISTEN)"),
  );

  await assert.rejects(
    async () => {
      await proxyServer.start();
    },
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Dev gateway port/);
      assert.match(error.message, /pid=4242/);
      assert.match(error.message, /next-server/);
      return true;
    },
  );

  await new Promise<void>((resolve, reject) => {
    occupiedServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});

test("GET /api/dev/health reports stopped, building, then ready", async () => {
  const harness = new ProxyHarness();
  activeHarnesses.push(harness);
  await harness.start();
  assert.ok(harness.proxyServer);

  const stopped = await harness.fetchApi("/api/dev/health");
  assert.equal(stopped.status, 200);
  assert.deepEqual(await stopped.json(), {
    ok: true,
    runtime: { status: "stopped" },
  });

  const runtime = new StubRuntimeServer("h");
  activeRuntimes.push(runtime);
  await runtime.start();
  await harness.proxyServer.activateRuntime({
    httpPort: runtime.httpPort,
    workflowWebSocketPort: runtime.workflowPort,
  });
  harness.proxyServer.setBuildStatus("building");
  const building = await harness.fetchApi("/api/dev/health");
  assert.deepEqual(await building.json(), {
    ok: true,
    runtime: { status: "building" },
  });

  harness.proxyServer.setBuildStatus("idle");
  const ready = await harness.fetchApi("/api/dev/health");
  assert.deepEqual(await ready.json(), {
    ok: true,
    runtime: { status: "ready" },
  });
});

test("dev socket clients receive broadcast build lifecycle payloads", async () => {
  const harness = new ProxyHarness();
  activeHarnesses.push(harness);
  await harness.start();
  assert.ok(harness.proxyServer);

  const devSocketUrl = `${toWebSocketHttpUrl(harness.httpBaseUrl)}${ApiPaths.devGatewaySocket()}`;
  const client = new WebSocket(devSocketUrl);
  const payloads: string[] = [];
  client.on("message", (data) => {
    payloads.push(typeof data === "string" ? data : data.toString("utf8"));
  });
  await new Promise<void>((resolve, reject) => {
    client.once("open", () => resolve());
    client.once("error", reject);
  });

  harness.proxyServer.broadcastBuildStarted();
  harness.proxyServer.broadcastBuildCompleted("build-42");
  harness.proxyServer.broadcastBuildFailed("compile error");

  await waitFor(() => payloads.length >= 3);
  assert.equal(JSON.parse(payloads[0] ?? "{}").kind, "devBuildStarted");
  assert.equal(JSON.parse(payloads[1] ?? "{}").kind, "devBuildCompleted");
  assert.equal(JSON.parse(payloads[1] ?? "{}").buildVersion, "build-42");
  assert.equal(JSON.parse(payloads[2] ?? "{}").kind, "devBuildFailed");
  assert.equal(JSON.parse(payloads[2] ?? "{}").message, "compile error");

  await new Promise<void>((resolve, reject) => {
    client.close();
    client.once("close", () => resolve());
    client.once("error", reject);
  });
});

test("workflow socket rejects unsupported client messages with an error payload", async () => {
  const harness = new ProxyHarness();
  activeHarnesses.push(harness);
  await harness.start();
  assert.ok(harness.proxyServer);

  const workflowUrl = `${toWebSocketHttpUrl(harness.httpBaseUrl)}${ApiPaths.workflowWebsocket()}`;
  const client = new WebSocket(workflowUrl);
  const payloads: string[] = [];
  client.on("message", (data) => {
    payloads.push(typeof data === "string" ? data : data.toString("utf8"));
  });
  await new Promise<void>((resolve, reject) => {
    client.once("open", () => resolve());
    client.once("error", reject);
  });

  await waitFor(() => payloads.some((p) => p.includes("ready")));
  client.send(JSON.stringify({ kind: "subscribe", roomId: 123 }));
  await waitFor(() => payloads.some((p) => p.includes('"kind":"error"')));
  const errorPayload = payloads.find((p) => p.includes('"kind":"error"')) ?? "";
  assert.match(errorPayload, /Unsupported websocket client message/);

  await new Promise<void>((resolve, reject) => {
    client.close();
    client.once("close", () => resolve());
    client.once("error", reject);
  });
});

test("proxies non-API HTTP traffic to the UI target when configured", async () => {
  const harness = new ProxyHarness();
  activeHarnesses.push(harness);
  await harness.start();
  assert.ok(harness.proxyServer);

  const ui = new StubUiServer();
  activeUiServers.push(ui);
  await ui.start();
  harness.proxyServer.setUiProxyTarget(`http://127.0.0.1:${ui.port}`);

  const page = await harness.fetchApi("/some-page");
  assert.equal(page.status, 200);
  assert.equal(await page.text(), "ui-ok");
});
