import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { ApiPaths } from "@codemation/host";
import httpProxy from "http-proxy";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import type { ListenPortConflictDescriber } from "./ListenPortConflictDescriber";

type WorkflowClientMessage =
  | Readonly<{ kind: "subscribe"; roomId: string }>
  | Readonly<{ kind: "unsubscribe"; roomId: string }>;

type ProxyRuntimeTarget = Readonly<{
  httpPort: number;
  workflowWebSocketPort: number;
}>;

type BuildStatus = "idle" | "building" | "errored";

interface WorkflowClientState {
  socket: WebSocket;
  token: string | null;
  childSocket: WebSocket | null;
  subscribedRoomIds: Set<string>;
}

export class CliDevProxyServer {
  private readonly proxy = httpProxy.createProxyServer({ ws: true, xfwd: true });
  private readonly devClients = new Set<WebSocket>();
  private readonly devWss = new WebSocketServer({ noServer: true });
  private readonly workflowWss = new WebSocketServer({ noServer: true });
  private readonly workflowClientStates = new Map<WebSocket, WorkflowClientState>();
  private activeRuntime: ProxyRuntimeTarget | null = null;
  private activeBuildStatus: BuildStatus = "idle";
  private server: HttpServer | null = null;
  private uiProxyTarget: string | null = null;

  constructor(
    private readonly listenPort: number,
    private readonly listenPortConflictDescriber: ListenPortConflictDescriber,
  ) {}

  async start(): Promise<void> {
    if (this.server) {
      return;
    }
    this.bindDevWebSocket();
    this.bindWorkflowWebSocket();
    this.proxy.on("error", (error, _req, res) => {
      if (res && "writeHead" in res && typeof res.writeHead === "function") {
        const serverResponse = res as ServerResponse;
        if (!serverResponse.headersSent) {
          serverResponse.writeHead(502, { "content-type": "text/plain" });
          serverResponse.end(`Bad gateway: ${error.message}`);
        }
      }
    });
    const server = createServer((req, res) => {
      void this.handleHttpRequest(req, res);
    });
    server.on("upgrade", (request, socket, head) => {
      this.handleUpgrade(request, socket, head);
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", (error) => {
        void this.rejectListenError(error, reject);
      });
      server.listen(this.listenPort, "127.0.0.1", () => {
        resolve();
      });
    });
    this.server = server;
  }

  async stop(): Promise<void> {
    this.activeRuntime = null;
    const server = this.server;
    this.server = null;
    for (const client of this.devClients) {
      client.terminate();
    }
    this.devClients.clear();
    for (const [clientSocket, state] of this.workflowClientStates) {
      this.terminateClientState(state);
      clientSocket.terminate();
    }
    this.workflowClientStates.clear();
    if (!server) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  setUiProxyTarget(target: string | null): void {
    this.uiProxyTarget = target?.trim() ? target.trim() : null;
  }

  async activateRuntime(target: ProxyRuntimeTarget | null): Promise<void> {
    this.activeRuntime = target;
    // Close all existing per-client upstreams so they reconnect to the new runtime.
    // Closing with code 4401 causes the canvas to reconnect with a fresh token.
    for (const [clientSocket, state] of this.workflowClientStates) {
      this.terminateClientState(state);
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.close(4401, "Runtime restarted");
      }
    }
    this.workflowClientStates.clear();
  }

  setBuildStatus(status: BuildStatus): void {
    this.activeBuildStatus = status;
    if (status === "building") {
      // Close upstream child sockets during rebuilds; clients will reconnect when ready.
      for (const [clientSocket, state] of this.workflowClientStates) {
        this.terminateClientState(state);
        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.close(4401, "Build started");
        }
      }
      this.workflowClientStates.clear();
    }
  }

  broadcastBuildStarted(): void {
    this.broadcastDev({ kind: "devBuildStarted" });
    this.broadcastWorkflowLifecycleToSubscribedRooms((roomId: string) => ({
      kind: "devBuildStarted",
      workflowId: roomId,
    }));
  }

  broadcastBuildCompleted(buildVersion: string): void {
    this.broadcastDev({ kind: "devBuildCompleted", buildVersion });
    this.broadcastWorkflowLifecycleToSubscribedRooms((roomId: string) => ({
      kind: "devBuildCompleted",
      workflowId: roomId,
      buildVersion,
    }));
  }

  broadcastBuildFailed(
    error: Readonly<{
      message: string;
      file?: string;
      line?: number;
      column?: number;
    }>,
  ): void {
    this.broadcastDev({ kind: "devBuildFailed", ...error });
    this.broadcastWorkflowLifecycleToSubscribedRooms((roomId: string) => ({
      kind: "devBuildFailed",
      workflowId: roomId,
      ...error,
    }));
  }

  private bindDevWebSocket(): void {
    this.devWss.on("connection", (socket) => {
      this.devClients.add(socket);
      socket.on("close", () => {
        this.devClients.delete(socket);
      });
    });
  }

  private bindWorkflowWebSocket(): void {
    this.workflowWss.on("connection", (socket, request) => {
      void this.connectWorkflowClient(socket, request);
    });
  }

  private async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const pathname = this.safePathname(req.url ?? "");
    const uiProxyTarget = this.uiProxyTarget;
    if (pathname === "/api/dev/health" && req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          runtime: {
            status: this.activeRuntime ? (this.activeBuildStatus === "building" ? "building" : "ready") : "stopped",
          },
        }),
      );
      return;
    }
    // Host-owned `/api/auth/*` is served by the disposable Hono runtime (same DB as other APIs).
    // Do not route it to the Next UI — that used to cause gateway → Next → gateway loops when Next
    // proxied auth back through CODEMATION_RUNTIME_DEV_URL.
    if (pathname.startsWith("/api/")) {
      const runtimeTarget = this.activeRuntime;
      if (pathname === "/api/dev/bootstrap-summary" && runtimeTarget) {
        this.proxy.web(req, res, {
          target: `http://127.0.0.1:${runtimeTarget.httpPort}`,
        });
        return;
      }
      if (this.activeBuildStatus === "building" || this.activeBuildStatus === "errored" || !runtimeTarget) {
        res.writeHead(503, { "content-type": "text/plain" });
        const message = this.activeBuildStatus === "errored" ? "Build failed." : "Runtime is rebuilding.";
        res.end(message);
        return;
      }
      this.proxy.web(req, res, {
        target: `http://127.0.0.1:${runtimeTarget.httpPort}`,
      });
      return;
    }
    if (uiProxyTarget) {
      this.proxy.web(req, res, {
        target: uiProxyTarget.replace(/\/$/, ""),
      });
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found.");
  }

  private handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const pathname = this.safePathname(request.url ?? "");
    if (pathname === ApiPaths.devGatewaySocket()) {
      this.devWss.handleUpgrade(request, socket, head, (ws) => {
        this.devWss.emit("connection", ws, request);
      });
      return;
    }
    if (pathname === ApiPaths.workflowWebsocket()) {
      this.workflowWss.handleUpgrade(request, socket, head, (ws) => {
        this.workflowWss.emit("connection", ws, request);
      });
      return;
    }
    const uiProxyTarget = this.uiProxyTarget;
    if (uiProxyTarget && !pathname.startsWith("/api/")) {
      this.proxy.ws(request, socket, head, {
        target: uiProxyTarget.replace(/\/$/, ""),
      });
      return;
    }
    socket.destroy();
  }

  private safePathname(url: string): string {
    try {
      return new URL(url, "http://127.0.0.1").pathname;
    } catch {
      return url.split("?")[0] ?? url;
    }
  }

  private extractToken(url: string | undefined): string | null {
    try {
      return new URL(url ?? "", "http://127.0.0.1").searchParams.get("token");
    } catch {
      return null;
    }
  }

  private extractOccupyingPids(listenerDescription: string): ReadonlyArray<number> {
    const seen = new Set<number>();
    const re = /pid=(\d+)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(listenerDescription)) !== null) {
      const pid = Number.parseInt(match[1] ?? "0", 10);
      if (Number.isFinite(pid) && pid > 0) {
        seen.add(pid);
      }
    }
    return [...seen];
  }

  private async rejectListenError(error: unknown, reject: (reason?: unknown) => void): Promise<void> {
    const errorWithCode = error as Error & Readonly<{ code?: unknown }>;
    if (errorWithCode.code !== "EADDRINUSE") {
      reject(error);
      return;
    }

    const description = await this.listenPortConflictDescriber.describeLoopbackPort(this.listenPort);
    const occupyingPids = description !== null ? this.extractOccupyingPids(description) : [];
    if (occupyingPids.length > 0) {
      const pidList = occupyingPids.join(", ");
      process.stderr.write(
        `[codemation] Dev gateway port ${this.listenPort} is already in use (occupying pid(s): ${pidList}).\n`,
      );
    }
    const baseMessage = `Dev gateway port ${this.listenPort} is already in use on 127.0.0.1.`;
    const suffix =
      description === null
        ? " Stop the process using that port or change the configured Codemation dev port."
        : ` Listener: ${description}. Stop that process or change the configured Codemation dev port.`;
    reject(new Error(`${baseMessage}${suffix}`, { cause: error instanceof Error ? error : undefined }));
  }

  private broadcastDev(message: Readonly<Record<string, unknown>>): void {
    const text = JSON.stringify(message);
    for (const client of this.devClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(text);
      }
    }
  }

  private broadcastWorkflowLifecycleToSubscribedRooms(
    createMessage: (roomId: string) => Readonly<Record<string, unknown>>,
  ): void {
    for (const [clientSocket, state] of this.workflowClientStates) {
      if (clientSocket.readyState !== WebSocket.OPEN) {
        continue;
      }
      for (const roomId of state.subscribedRoomIds) {
        clientSocket.send(JSON.stringify(createMessage(roomId)));
      }
    }
  }

  private async connectWorkflowClient(socket: WebSocket, request: IncomingMessage): Promise<void> {
    const token = this.extractToken(request.url);
    const state: WorkflowClientState = {
      socket,
      token,
      childSocket: null,
      subscribedRoomIds: new Set(),
    };
    this.workflowClientStates.set(socket, state);
    socket.send(JSON.stringify({ kind: "ready" }));
    socket.on("message", (rawData) => {
      void this.handleWorkflowClientMessage(socket, rawData);
    });
    socket.on("close", () => {
      this.disconnectWorkflowClient(socket);
    });
    socket.on("error", () => {
      this.disconnectWorkflowClient(socket);
    });

    const runtime = this.activeRuntime;
    if (!runtime || this.activeBuildStatus === "building") {
      return;
    }
    await this.openPerClientChildSocket(state, runtime.workflowWebSocketPort);
  }

  private disconnectWorkflowClient(socket: WebSocket): void {
    const state = this.workflowClientStates.get(socket);
    if (state) {
      this.terminateClientState(state);
    }
    this.workflowClientStates.delete(socket);
  }

  private terminateClientState(state: WorkflowClientState): void {
    if (state.childSocket) {
      state.childSocket.terminate();
      state.childSocket = null;
    }
  }

  private async handleWorkflowClientMessage(socket: WebSocket, rawData: unknown): Promise<void> {
    try {
      const message = this.parseWorkflowClientMessage(rawData);
      const state = this.workflowClientStates.get(socket);
      if (!state) {
        return;
      }
      if (message.kind === "subscribe") {
        if (!state.subscribedRoomIds.has(message.roomId)) {
          state.subscribedRoomIds.add(message.roomId);
          this.sendToChildSocket(state, { kind: "subscribe", roomId: message.roomId });
        }
        socket.send(JSON.stringify({ kind: "subscribed", roomId: message.roomId }));
        return;
      }
      if (state.subscribedRoomIds.delete(message.roomId)) {
        this.sendToChildSocket(state, { kind: "unsubscribe", roomId: message.roomId });
      }
      socket.send(JSON.stringify({ kind: "unsubscribed", roomId: message.roomId }));
    } catch (error) {
      const exception = error instanceof Error ? error : new Error(String(error));
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ kind: "error", message: exception.message }));
      }
    }
  }

  private parseWorkflowClientMessage(rawData: unknown): WorkflowClientMessage {
    const value = typeof rawData === "string" ? rawData : Buffer.isBuffer(rawData) ? rawData.toString("utf8") : "";
    const message = JSON.parse(value) as Readonly<{ kind?: unknown; roomId?: unknown }>;
    if (message.kind === "subscribe" && typeof message.roomId === "string") {
      return { kind: "subscribe", roomId: message.roomId };
    }
    if (message.kind === "unsubscribe" && typeof message.roomId === "string") {
      return { kind: "unsubscribe", roomId: message.roomId };
    }
    throw new Error("Unsupported websocket client message.");
  }

  private sendToChildSocket(state: WorkflowClientState, message: WorkflowClientMessage): void {
    if (!state.childSocket || state.childSocket.readyState !== WebSocket.OPEN) {
      return;
    }
    state.childSocket.send(JSON.stringify(message));
  }

  private buildChildUrl(workflowWebSocketPort: number, token: string | null): string {
    const base = `ws://127.0.0.1:${workflowWebSocketPort}${ApiPaths.workflowWebsocket()}`;
    if (!token) {
      return base;
    }
    const url = new URL(base);
    url.searchParams.set("token", token);
    return url.toString();
  }

  private async openPerClientChildSocket(state: WorkflowClientState, workflowWebSocketPort: number): Promise<void> {
    const childUrl = this.buildChildUrl(workflowWebSocketPort, state.token);
    let childSocket: WebSocket;
    try {
      childSocket = await this.openChildSocket(childUrl);
    } catch {
      // Runtime not ready or auth rejected — close client with 4401 so canvas reconnects.
      if (state.socket.readyState === WebSocket.OPEN) {
        state.socket.close(4401, "Upstream unavailable");
      }
      this.workflowClientStates.delete(state.socket);
      return;
    }
    // Check that the client is still connected after the async open.
    if (!this.workflowClientStates.has(state.socket)) {
      childSocket.terminate();
      return;
    }
    state.childSocket = childSocket;
    childSocket.on("message", (rawData) => {
      this.handleChildSocketMessage(state, rawData);
    });
    const onChildClose = () => {
      if (state.childSocket !== childSocket) return;
      state.childSocket = null;
      // Close client so the canvas reconnects with a fresh token.
      if (state.socket.readyState === WebSocket.OPEN) {
        state.socket.close(4401, "Upstream closed");
      }
      this.workflowClientStates.delete(state.socket);
    };
    childSocket.on("close", onChildClose);
    childSocket.on("error", onChildClose);
    // Re-issue subscriptions if the client already subscribed before the child was ready.
    for (const roomId of state.subscribedRoomIds) {
      this.sendToChildSocket(state, { kind: "subscribe", roomId });
    }
  }

  private openChildSocket(url: string): Promise<WebSocket> {
    return new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.once("open", () => {
        resolve(socket);
      });
      socket.once("error", (error) => {
        socket.terminate();
        reject(error);
      });
      // ws emits "unexpected-response" for non-101 HTTP responses (e.g. 401).
      socket.once("unexpected-response", (_req, response) => {
        socket.terminate();
        reject(new Error(`Upstream WS upgrade failed: ${response.statusCode}`));
      });
    });
  }

  private handleChildSocketMessage(state: WorkflowClientState, rawData: unknown): void {
    const text = typeof rawData === "string" ? rawData : Buffer.isBuffer(rawData) ? rawData.toString("utf8") : "";
    if (text.trim().length === 0) {
      return;
    }
    if (state.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      const message = JSON.parse(text) as Readonly<{
        event?: Readonly<{ workflowId?: unknown }>;
        kind?: unknown;
        message?: unknown;
        runId?: unknown;
        workflowId?: unknown;
      }>;
      if (message.kind === "event" && typeof message.event?.workflowId === "string") {
        if (state.subscribedRoomIds.has(message.event.workflowId)) {
          state.socket.send(text);
        }
        return;
      }
      if (message.kind === "telemetryEvent" && typeof message.runId === "string") {
        if (state.subscribedRoomIds.has(`run:${message.runId}`)) {
          state.socket.send(text);
        }
        return;
      }
      if (
        (message.kind === "workflowChanged" ||
          message.kind === "devBuildStarted" ||
          message.kind === "devBuildCompleted" ||
          message.kind === "devBuildFailed") &&
        typeof message.workflowId === "string"
      ) {
        if (state.subscribedRoomIds.has(message.workflowId)) {
          state.socket.send(text);
        }
        return;
      }
      if (message.kind === "error" && typeof message.message === "string") {
        state.socket.send(text);
      }
    } catch {
      // Ignore malformed runtime workflow websocket messages.
    }
  }
}
