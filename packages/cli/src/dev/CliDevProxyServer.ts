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

type BuildStatus = "idle" | "building";

export class CliDevProxyServer {
  private readonly proxy = httpProxy.createProxyServer({ ws: true, xfwd: true });
  private readonly devClients = new Set<WebSocket>();
  private readonly devWss = new WebSocketServer({ noServer: true });
  private readonly workflowClients = new Set<WebSocket>();
  private readonly workflowWss = new WebSocketServer({ noServer: true });
  private readonly roomIdsByWorkflowClient = new Map<WebSocket, Set<string>>();
  private readonly workflowClientCountByRoomId = new Map<string, number>();
  private activeRuntime: ProxyRuntimeTarget | null = null;
  private activeBuildStatus: BuildStatus = "idle";
  private childWorkflowSocket: WebSocket | null = null;
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
    await this.disconnectChildWorkflowSocket();
    this.activeRuntime = null;
    const server = this.server;
    this.server = null;
    for (const client of this.devClients) {
      client.terminate();
    }
    this.devClients.clear();
    for (const client of this.workflowClients) {
      client.terminate();
    }
    this.workflowClients.clear();
    this.roomIdsByWorkflowClient.clear();
    this.workflowClientCountByRoomId.clear();
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
    await this.connectChildWorkflowSocket();
  }

  setBuildStatus(status: BuildStatus): void {
    this.activeBuildStatus = status;
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

  broadcastBuildFailed(message: string): void {
    this.broadcastDev({ kind: "devBuildFailed", message });
    this.broadcastWorkflowLifecycleToSubscribedRooms((roomId: string) => ({
      kind: "devBuildFailed",
      workflowId: roomId,
      message,
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
    this.workflowWss.on("connection", (socket) => {
      void this.connectWorkflowClient(socket);
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
      if (this.activeBuildStatus === "building" || !runtimeTarget) {
        res.writeHead(503, { "content-type": "text/plain" });
        res.end("Runtime is rebuilding.");
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
    for (const roomId of this.workflowClientCountByRoomId.keys()) {
      this.broadcastWorkflowTextToRoom(roomId, JSON.stringify(createMessage(roomId)));
    }
  }

  private async connectWorkflowClient(socket: WebSocket): Promise<void> {
    this.workflowClients.add(socket);
    this.roomIdsByWorkflowClient.set(socket, new Set());
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
  }

  private disconnectWorkflowClient(socket: WebSocket): void {
    const roomIds = this.roomIdsByWorkflowClient.get(socket);
    if (roomIds) {
      for (const roomId of roomIds) {
        this.releaseWorkflowRoom(roomId);
      }
    }
    this.roomIdsByWorkflowClient.delete(socket);
    this.workflowClients.delete(socket);
  }

  private async handleWorkflowClientMessage(socket: WebSocket, rawData: unknown): Promise<void> {
    try {
      const message = this.parseWorkflowClientMessage(rawData);
      if (message.kind === "subscribe") {
        const roomIds = this.roomIdsByWorkflowClient.get(socket);
        if (!roomIds) {
          return;
        }
        if (!roomIds.has(message.roomId)) {
          roomIds.add(message.roomId);
          this.retainWorkflowRoom(message.roomId);
        }
        socket.send(JSON.stringify({ kind: "subscribed", roomId: message.roomId }));
        return;
      }
      const roomIds = this.roomIdsByWorkflowClient.get(socket);
      if (!roomIds) {
        return;
      }
      if (roomIds.delete(message.roomId)) {
        this.releaseWorkflowRoom(message.roomId);
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

  private retainWorkflowRoom(roomId: string): void {
    const nextCount = (this.workflowClientCountByRoomId.get(roomId) ?? 0) + 1;
    this.workflowClientCountByRoomId.set(roomId, nextCount);
    if (nextCount === 1) {
      this.sendToChildWorkflowSocket({ kind: "subscribe", roomId });
    }
  }

  private releaseWorkflowRoom(roomId: string): void {
    const currentCount = this.workflowClientCountByRoomId.get(roomId) ?? 0;
    if (currentCount <= 1) {
      this.workflowClientCountByRoomId.delete(roomId);
      this.sendToChildWorkflowSocket({ kind: "unsubscribe", roomId });
      return;
    }
    this.workflowClientCountByRoomId.set(roomId, currentCount - 1);
  }

  private sendToChildWorkflowSocket(message: WorkflowClientMessage): void {
    if (!this.childWorkflowSocket || this.childWorkflowSocket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.childWorkflowSocket.send(JSON.stringify(message));
  }

  private async connectChildWorkflowSocket(): Promise<void> {
    await this.disconnectChildWorkflowSocket();
    if (!this.activeRuntime || this.activeBuildStatus === "building") {
      return;
    }
    const childWorkflowSocket = await this.openChildWorkflowSocket(this.activeRuntime.workflowWebSocketPort);
    this.childWorkflowSocket = childWorkflowSocket;
    childWorkflowSocket.on("message", (rawData) => {
      this.handleChildWorkflowSocketMessage(rawData);
    });
    childWorkflowSocket.on("close", () => {
      if (this.childWorkflowSocket === childWorkflowSocket) {
        this.childWorkflowSocket = null;
      }
    });
    childWorkflowSocket.on("error", () => {
      if (this.childWorkflowSocket === childWorkflowSocket) {
        this.childWorkflowSocket = null;
      }
    });
    for (const roomId of this.workflowClientCountByRoomId.keys()) {
      this.sendToChildWorkflowSocket({ kind: "subscribe", roomId });
    }
  }

  private openChildWorkflowSocket(workflowWebSocketPort: number): Promise<WebSocket> {
    return new Promise<WebSocket>((resolve, reject) => {
      const childWorkflowUrl = `ws://127.0.0.1:${workflowWebSocketPort}${ApiPaths.workflowWebsocket()}`;
      const socket = new WebSocket(childWorkflowUrl);
      socket.once("open", () => {
        resolve(socket);
      });
      socket.once("error", (error) => {
        socket.close();
        reject(error);
      });
    });
  }

  private async disconnectChildWorkflowSocket(): Promise<void> {
    if (!this.childWorkflowSocket) {
      return;
    }
    const socket = this.childWorkflowSocket;
    this.childWorkflowSocket = null;
    await new Promise<void>((resolve) => {
      socket.once("close", () => {
        resolve();
      });
      socket.close();
    });
  }

  private handleChildWorkflowSocketMessage(rawData: unknown): void {
    const text = typeof rawData === "string" ? rawData : Buffer.isBuffer(rawData) ? rawData.toString("utf8") : "";
    if (text.trim().length === 0) {
      return;
    }
    try {
      const message = JSON.parse(text) as Readonly<{
        event?: Readonly<{ workflowId?: unknown }>;
        kind?: unknown;
        message?: unknown;
        workflowId?: unknown;
      }>;
      if (message.kind === "event" && typeof message.event?.workflowId === "string") {
        this.broadcastWorkflowTextToRoom(message.event.workflowId, text);
        return;
      }
      if (
        (message.kind === "workflowChanged" ||
          message.kind === "devBuildStarted" ||
          message.kind === "devBuildCompleted" ||
          message.kind === "devBuildFailed") &&
        typeof message.workflowId === "string"
      ) {
        this.broadcastWorkflowTextToRoom(message.workflowId, text);
        return;
      }
      if (message.kind === "error" && typeof message.message === "string") {
        this.broadcastWorkflowTextToAll(text);
      }
    } catch {
      // Ignore malformed runtime workflow websocket messages.
    }
  }

  private broadcastWorkflowTextToRoom(roomId: string, text: string): void {
    for (const [client, roomIds] of this.roomIdsByWorkflowClient) {
      if (client.readyState !== WebSocket.OPEN || !roomIds.has(roomId)) {
        continue;
      }
      client.send(text);
    }
  }

  private broadcastWorkflowTextToAll(text: string): void {
    for (const client of this.workflowClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(text);
      }
    }
  }
}
