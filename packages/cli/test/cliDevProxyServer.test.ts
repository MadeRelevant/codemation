import assert from "node:assert/strict";
import { createServer, type Server as HttpServer, type IncomingMessage } from "node:http";
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
  readonly upgradeUrls: string[] = [];
  readonly connectedSockets: WebSocket[] = [];

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
    this.workflowSocketServer.on("connection", (socket: WebSocket, request: IncomingMessage) => {
      this.upgradeUrls.push(request.url ?? "");
      this.connectedSockets.push(socket);
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

class StubUnauthorizedRuntimeServer {
  private websocketServer: HttpServer | null = null;
  private _workflowPort = 0;

  get workflowPort(): number {
    return this._workflowPort;
  }

  async start(): Promise<void> {
    this.websocketServer = createServer();
    this.websocketServer.on("upgrade", (_request, socket) => {
      socket.write("HTTP/1.1 401 Unauthorized\r\ncontent-length: 0\r\n\r\n");
      socket.destroy();
    });
    await new Promise<void>((resolve, reject) => {
      this.websocketServer!.once("error", reject);
      this.websocketServer!.listen(0, "127.0.0.1", () => resolve());
    });
    this._workflowPort = (this.websocketServer.address() as AddressInfo).port;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      if (!this.websocketServer) {
        resolve();
        return;
      }
      this.websocketServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    this.websocketServer = null;
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
const activeUnauthorizedRuntimes: StubUnauthorizedRuntimeServer[] = [];
const activeHarnesses: ProxyHarness[] = [];
const activeUiServers: StubUiServer[] = [];

afterEach(async () => {
  await Promise.all(activeHarnesses.map(async (harness) => await harness.stop()));
  activeHarnesses.length = 0;
  await Promise.all(activeRuntimes.map(async (runtime) => await runtime.stop()));
  activeRuntimes.length = 0;
  await Promise.all(activeUnauthorizedRuntimes.map(async (runtime) => await runtime.stop()));
  activeUnauthorizedRuntimes.length = 0;
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
  const stderrLines: string[] = [];
  const originalWrite = process.stderr.write;
  const write = originalWrite.bind(process.stderr) as {
    (chunk: string | Uint8Array): boolean;
    (chunk: string | Uint8Array, cb: (err?: Error | null) => void): boolean;
    (chunk: string | Uint8Array, encoding: BufferEncoding, cb?: (err?: Error | null) => void): boolean;
  };
  process.stderr.write = function (
    chunk: string | Uint8Array,
    ...args: [encoding?: BufferEncoding | ((err?: Error | null) => void), cb?: (err?: Error | null) => void]
  ): boolean {
    if (typeof chunk === "string") {
      stderrLines.push(chunk);
    }
    const [encodingOrCallback, callback] = args;
    if (typeof encodingOrCallback === "function") {
      return write(chunk, encodingOrCallback);
    }
    if (callback) {
      if (!encodingOrCallback) {
        return write(chunk, callback);
      }
      return write(chunk, encodingOrCallback, callback);
    }
    if (encodingOrCallback) {
      return write(chunk, encodingOrCallback);
    }
    return write(chunk);
  };

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

  try {
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
    const combinedStderr = stderrLines.join("");
    assert.match(combinedStderr, /occupying pid\(s\): 4242/);
  } finally {
    process.stderr.write = originalWrite;
    await new Promise<void>((resolve, reject) => {
      occupiedServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
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
  harness.proxyServer.broadcastBuildFailed({ message: "compile error" });

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

  // Must activate a runtime — without one, the proxy closes the client socket immediately (4401).
  const runtime = new StubRuntimeServer("ws-error-test");
  activeRuntimes.push(runtime);
  await runtime.start();
  await harness.proxyServer.activateRuntime({
    httpPort: runtime.httpPort,
    workflowWebSocketPort: runtime.workflowPort,
  });

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

test("routes /api/auth/* to the disposable runtime when the UI proxy is configured", async () => {
  const harness = new ProxyHarness();
  activeHarnesses.push(harness);
  await harness.start();
  assert.ok(harness.proxyServer);

  const ui = new StubUiServer();
  activeUiServers.push(ui);
  await ui.start();
  harness.proxyServer.setUiProxyTarget(`http://127.0.0.1:${ui.port}`);

  const runtime = new StubRuntimeServer("auth-from-runtime");
  activeRuntimes.push(runtime);
  await runtime.start();
  await harness.proxyServer.activateRuntime({
    httpPort: runtime.httpPort,
    workflowWebSocketPort: runtime.workflowPort,
  });

  const response = await harness.fetchApi("/api/auth/session");
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "auth-from-runtime");
});

test("workflow WS: client with token causes upstream child socket to include the same token", async () => {
  const harness = new ProxyHarness();
  activeHarnesses.push(harness);
  await harness.start();
  assert.ok(harness.proxyServer);

  const runtime = new StubRuntimeServer("token-test");
  activeRuntimes.push(runtime);
  await runtime.start();
  await harness.proxyServer.activateRuntime({
    httpPort: runtime.httpPort,
    workflowWebSocketPort: runtime.workflowPort,
  });

  const token = "test-jwt-abc123";
  const workflowUrl = `${toWebSocketHttpUrl(harness.httpBaseUrl)}${ApiPaths.workflowWebsocket()}?token=${token}`;
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
  // The upstream should have received an upgrade request with the same token.
  await waitFor(() => runtime.upgradeUrls.length > 0);
  assert.ok(runtime.upgradeUrls.some((url) => url.includes(`token=${token}`)));

  client.close();
  await new Promise<void>((resolve) => client.once("close", resolve));
});

test("workflow WS: client without token opens upstream without a token", async () => {
  const harness = new ProxyHarness();
  activeHarnesses.push(harness);
  await harness.start();
  assert.ok(harness.proxyServer);

  const runtime = new StubRuntimeServer("no-token-test");
  activeRuntimes.push(runtime);
  await runtime.start();
  await harness.proxyServer.activateRuntime({
    httpPort: runtime.httpPort,
    workflowWebSocketPort: runtime.workflowPort,
  });

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
  await waitFor(() => runtime.upgradeUrls.length > 0);
  // Upstream URL should not contain a token parameter.
  assert.ok(runtime.upgradeUrls.every((url) => !url.includes("token=")));

  client.close();
  await new Promise<void>((resolve) => client.once("close", resolve));
});

test("workflow WS: upstream 401 causes client to receive close code 4401", async () => {
  const harness = new ProxyHarness();
  activeHarnesses.push(harness);
  await harness.start();
  assert.ok(harness.proxyServer);

  const unauthorizedRuntime = new StubUnauthorizedRuntimeServer();
  activeUnauthorizedRuntimes.push(unauthorizedRuntime);
  await unauthorizedRuntime.start();

  // Use a fake httpPort (the client 4401 test doesn't need HTTP routing).
  await harness.proxyServer.activateRuntime({
    httpPort: 1,
    workflowWebSocketPort: unauthorizedRuntime.workflowPort,
  });

  const workflowUrl = `${toWebSocketHttpUrl(harness.httpBaseUrl)}${ApiPaths.workflowWebsocket()}?token=bad-token`;
  const client = new WebSocket(workflowUrl);
  let receivedCloseCode = 0;
  client.on("close", (code) => {
    receivedCloseCode = code;
  });
  // Client WS upgrade itself should succeed (proxy accepts it), but then close.
  await new Promise<void>((resolve, reject) => {
    client.once("open", () => resolve());
    client.once("error", reject);
  });

  await waitFor(() => receivedCloseCode !== 0);
  assert.equal(receivedCloseCode, 4401);
});

test("workflow WS: subscribe message is forwarded to that client's child socket only", async () => {
  const harness = new ProxyHarness();
  activeHarnesses.push(harness);
  await harness.start();
  assert.ok(harness.proxyServer);

  const runtime = new StubRuntimeServer("subscribe-test");
  activeRuntimes.push(runtime);
  await runtime.start();
  await harness.proxyServer.activateRuntime({
    httpPort: runtime.httpPort,
    workflowWebSocketPort: runtime.workflowPort,
  });

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
  await waitFor(() => runtime.connectedSockets.length > 0);

  const childReceivedMessages: string[] = [];
  const childSocket = runtime.connectedSockets[0];
  assert.ok(childSocket);
  childSocket.on("message", (data) => {
    childReceivedMessages.push(typeof data === "string" ? data : data.toString("utf8"));
  });

  client.send(JSON.stringify({ kind: "subscribe", roomId: "workflow-xyz" }));
  await waitFor(() => childReceivedMessages.some((m) => m.includes("subscribe")));
  assert.ok(childReceivedMessages.some((m) => m.includes("workflow-xyz")));

  // Confirm the proxy sent a "subscribed" confirmation back to the client.
  await waitFor(() => payloads.some((p) => p.includes('"kind":"subscribed"')));

  client.close();
  await new Promise<void>((resolve) => client.once("close", resolve));
});

test("workflow WS: event on client A's child socket goes only to client A not client B", async () => {
  const harness = new ProxyHarness();
  activeHarnesses.push(harness);
  await harness.start();
  assert.ok(harness.proxyServer);

  const runtime = new StubRuntimeServer("isolation-test");
  activeRuntimes.push(runtime);
  await runtime.start();
  await harness.proxyServer.activateRuntime({
    httpPort: runtime.httpPort,
    workflowWebSocketPort: runtime.workflowPort,
  });

  const workflowUrl = `${toWebSocketHttpUrl(harness.httpBaseUrl)}${ApiPaths.workflowWebsocket()}`;

  // Connect two clients.
  const clientA = new WebSocket(`${workflowUrl}?token=token-a`);
  const clientB = new WebSocket(`${workflowUrl}?token=token-b`);
  const payloadsA: string[] = [];
  const payloadsB: string[] = [];
  clientA.on("message", (data) => {
    payloadsA.push(typeof data === "string" ? data : data.toString("utf8"));
  });
  clientB.on("message", (data) => {
    payloadsB.push(typeof data === "string" ? data : data.toString("utf8"));
  });

  await Promise.all([
    new Promise<void>((resolve, reject) => {
      clientA.once("open", () => resolve());
      clientA.once("error", reject);
    }),
    new Promise<void>((resolve, reject) => {
      clientB.once("open", () => resolve());
      clientB.once("error", reject);
    }),
  ]);

  await waitFor(() => payloadsA.some((p) => p.includes("ready")));
  await waitFor(() => payloadsB.some((p) => p.includes("ready")));
  // Wait for both upstream sockets to be established.
  await waitFor(() => runtime.connectedSockets.length >= 2);

  const sharedRoomId = "shared-workflow-id";
  clientA.send(JSON.stringify({ kind: "subscribe", roomId: sharedRoomId }));
  clientB.send(JSON.stringify({ kind: "subscribe", roomId: sharedRoomId }));
  await waitFor(() => payloadsA.some((p) => p.includes('"kind":"subscribed"')));
  await waitFor(() => payloadsB.some((p) => p.includes('"kind":"subscribed"')));

  // Send an event on client A's child socket (first connected).
  const childSocketA = runtime.connectedSockets[0];
  assert.ok(childSocketA);
  const eventPayload = JSON.stringify({
    kind: "event",
    event: { workflowId: sharedRoomId, type: "run.started" },
  });
  childSocketA.send(eventPayload);

  await waitFor(() => payloadsA.some((p) => p.includes("run.started")));

  // Give client B a moment to receive anything unexpected.
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(
    payloadsB.filter((p) => p.includes("run.started")).length,
    0,
    "Client B must not receive client A's event",
  );

  clientA.close();
  clientB.close();
  await Promise.all([
    new Promise<void>((resolve) => clientA.once("close", resolve)),
    new Promise<void>((resolve) => clientB.once("close", resolve)),
  ]);
});
