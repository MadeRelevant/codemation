import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createNetServer } from "node:net";
import type { Duplex } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { ApiPaths } from "@codemation/host";
import { DevelopmentRuntimeRouteGuard } from "@codemation/host/dev-server-sidecar";
import httpProxy from "http-proxy";
import { WebSocket, WebSocketServer } from "ws";

type GatewayChildState = "stopped" | "starting" | "ready";
type WorkflowClientMessage =
  | Readonly<{ kind: "subscribe"; roomId: string }>
  | Readonly<{ kind: "unsubscribe"; roomId: string }>;

export class CodemationDevGateway {
  private readonly proxy = httpProxy.createProxyServer({ ws: true, xfwd: true });
  private readonly devClients = new Set<WebSocket>();
  private readonly devWss = new WebSocketServer({ noServer: true });
  private readonly workflowClients = new Set<WebSocket>();
  private readonly workflowWss = new WebSocketServer({ noServer: true });
  private readonly roomIdsByWorkflowClient = new Map<WebSocket, Set<string>>();
  private readonly workflowClientCountByRoomId = new Map<string, number>();
  private child: ChildProcess | null = null;
  private childWorkflowSocket: WebSocket | null = null;
  private childHttpPort = 0;
  private childWsPort = 0;
  private childState: GatewayChildState = "stopped";
  private restartInFlight: Promise<void> | null = null;

  async start(): Promise<void> {
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
    await this.spawnChild();
    const listenPort = this.resolveGatewayListenPort();
    const server = createServer((req, res) => {
      void this.handleHttpRequest(req, res);
    });
    server.on("upgrade", (request, socket, head) => {
      this.handleUpgrade(request, socket, head);
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(listenPort, "127.0.0.1", () => {
        resolve();
      });
    });
    for (const signal of ["SIGINT", "SIGTERM", "SIGQUIT"] as const) {
      process.on(signal, () => {
        void this.shutdown(server);
      });
    }
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

  private resolveGatewayListenPort(): number {
    const raw = process.env.CODEMATION_DEV_GATEWAY_HTTP_PORT;
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
    throw new Error("Missing or invalid CODEMATION_DEV_GATEWAY_HTTP_PORT.");
  }

  private async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const pathname = this.safePathname(req.url ?? "");
    const uiProxyTarget = process.env.CODEMATION_DEV_UI_PROXY_TARGET?.trim();
    if (pathname === "/api/dev/health" && req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          child: { status: this.childState },
        }),
      );
      return;
    }
    if (pathname === ApiPaths.devGatewayNotify() && req.method === "POST") {
      await this.handleNotify(req, res);
      return;
    }
    if (uiProxyTarget && uiProxyTarget.length > 0 && pathname.startsWith("/api/auth/")) {
      this.proxy.web(req, res, {
        target: uiProxyTarget.replace(/\/$/, ""),
      });
      return;
    }
    if (pathname.startsWith("/api/")) {
      if (this.childState !== "ready" || this.childHttpPort <= 0) {
        res.writeHead(503, { "content-type": "text/plain" });
        res.end("Runtime child is not ready.");
        return;
      }
      this.proxy.web(req, res, {
        target: `http://127.0.0.1:${this.childHttpPort}`,
      });
      return;
    }
    if (uiProxyTarget && uiProxyTarget.length > 0) {
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
    const uiProxyTarget = process.env.CODEMATION_DEV_UI_PROXY_TARGET?.trim();
    if (uiProxyTarget && uiProxyTarget.length > 0 && !pathname.startsWith("/api/")) {
      this.proxy.ws(request, socket, head, {
        target: uiProxyTarget.replace(/\/$/, ""),
      });
      return;
    }
    if (this.childState !== "ready" || this.childWsPort <= 0) {
      socket.destroy();
      return;
    }
    this.proxy.ws(request, socket, head, {
      target: `http://127.0.0.1:${this.childWsPort}`,
    });
  }

  private safePathname(url: string): string {
    try {
      return new URL(url, "http://127.0.0.1").pathname;
    } catch {
      return url.split("?")[0] ?? url;
    }
  }

  private async handleNotify(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestUrl = `http://127.0.0.1${req.url ?? ""}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") {
        headers.set(key, value);
      } else if (Array.isArray(value)) {
        for (const v of value) {
          headers.append(key, v);
        }
      }
    }
    const fetchRequest = new Request(requestUrl, {
      method: req.method,
      headers,
    });
    if (!DevelopmentRuntimeRouteGuard.isAuthorized(fetchRequest)) {
      res.writeHead(401, { "content-type": "text/plain" });
      res.end("Unauthorized");
      return;
    }
    const bodyText = await this.readRequestBody(req);
    let payload: Readonly<{ kind?: unknown; buildVersion?: unknown; message?: unknown }> = {};
    if (bodyText.trim().length > 0) {
      try {
        payload = JSON.parse(bodyText) as Readonly<{ kind?: unknown; buildVersion?: unknown; message?: unknown }>;
      } catch {
        res.writeHead(400, { "content-type": "text/plain" });
        res.end("Invalid JSON");
        return;
      }
    }
    const kind = payload.kind;
    if (kind === "buildStarted") {
      this.broadcastDev({ kind: "devBuildStarted" });
      this.broadcastWorkflowLifecycleToSubscribedRooms((roomId: string) => ({
        kind: "devBuildStarted",
        workflowId: roomId,
      }));
      res.writeHead(204);
      res.end();
      return;
    }
    if (kind === "buildFailed" && typeof payload.message === "string") {
      this.broadcastDev({ kind: "devBuildFailed", message: payload.message });
      this.broadcastWorkflowLifecycleToSubscribedRooms((roomId: string) => ({
        kind: "devBuildFailed",
        workflowId: roomId,
        message: payload.message as string,
      }));
      res.writeHead(204);
      res.end();
      return;
    }
    if (kind === "buildCompleted") {
      await this.restartChild();
      this.broadcastDev({ kind: "devBuildCompleted" });
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(400, { "content-type": "text/plain" });
    res.end("Unsupported notify kind.");
  }

  private async readRequestBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
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

  private async restartChild(): Promise<void> {
    if (this.restartInFlight) {
      await this.restartInFlight;
      return;
    }
    this.restartInFlight = (async () => {
      await this.killChild();
      await this.spawnChild();
    })();
    try {
      await this.restartInFlight;
    } finally {
      this.restartInFlight = null;
    }
  }

  private async killChild(): Promise<void> {
    await this.disconnectChildWorkflowSocket();
    if (!this.child) {
      this.childState = "stopped";
      return;
    }
    const toKill = this.child;
    this.child = null;
    this.childState = "stopped";
    toKill.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      toKill.once("exit", () => {
        resolve();
      });
    });
  }

  private async spawnChild(): Promise<void> {
    this.childState = "starting";
    this.childHttpPort = await this.resolveFreePortOnLoopback();
    this.childWsPort = await this.resolveFreePortOnLoopback();
    const childCommand = process.env.CODEMATION_RUNTIME_CHILD_BIN;
    if (!childCommand || childCommand.trim().length === 0) {
      throw new Error("Missing CODEMATION_RUNTIME_CHILD_BIN.");
    }
    const childArgs = this.resolveChildArgs();
    const cwd =
      process.env.CODEMATION_RUNTIME_CHILD_CWD && process.env.CODEMATION_RUNTIME_CHILD_CWD.trim().length > 0
        ? process.env.CODEMATION_RUNTIME_CHILD_CWD
        : process.cwd();
    this.child = spawn(childCommand, childArgs, {
      cwd,
      stdio: "inherit",
      env: {
        ...process.env,
        ...this.resolveChildEnvironment(),
        CODEMATION_RUNTIME_HTTP_PORT: String(this.childHttpPort),
        CODEMATION_WS_PORT: String(this.childWsPort),
        // Child env JSON must not override the gateway process database URL (e.g. Playwright e2e).
        DATABASE_URL: process.env.DATABASE_URL,
        AUTH_SECRET: process.env.AUTH_SECRET,
      },
    });
    this.child.on("exit", (code: number | null) => {
      if (this.child !== null) {
        this.child = null;
        this.childState = "stopped";
        if (code !== 0 && code !== null) {
          console.error(`codemation dev-gateway: runtime child exited with code ${code}`);
        }
      }
    });
    await this.waitForChildHealth();
    await this.connectChildWorkflowSocket();
    this.childState = "ready";
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
    const childWorkflowSocket = await this.openChildWorkflowSocket();
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

  private async openChildWorkflowSocket(): Promise<WebSocket> {
    const childWorkflowUrl = `ws://127.0.0.1:${this.childWsPort}${ApiPaths.workflowWebsocket()}`;
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      try {
        return await new Promise<WebSocket>((resolve, reject) => {
          const socket = new WebSocket(childWorkflowUrl);
          const handleOpen = (): void => {
            socket.off("error", handleError);
            resolve(socket);
          };
          const handleError = (error: Error): void => {
            socket.off("open", handleOpen);
            socket.close();
            reject(error);
          };
          socket.once("open", handleOpen);
          socket.once("error", handleError);
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        await delay(50);
      }
    }
    throw lastError ?? new Error("Timed out waiting for runtime child workflow websocket.");
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
        (message.kind === "workflowChanged"
          || message.kind === "devBuildStarted"
          || message.kind === "devBuildCompleted"
          || message.kind === "devBuildFailed")
        && typeof message.workflowId === "string"
      ) {
        this.broadcastWorkflowTextToRoom(message.workflowId, text);
        return;
      }
      if (message.kind === "error" && typeof message.message === "string") {
        this.broadcastWorkflowTextToAll(text);
      }
    } catch {
      // Ignore malformed upstream workflow websocket messages.
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

  private resolveChildArgs(): ReadonlyArray<string> {
    const raw = process.env.CODEMATION_RUNTIME_CHILD_ARGS_JSON;
    if (!raw || raw.trim().length === 0) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.some((entry: unknown) => typeof entry !== "string")) {
      throw new Error("Invalid CODEMATION_RUNTIME_CHILD_ARGS_JSON.");
    }
    return parsed;
  }

  private resolveChildEnvironment(): Readonly<Record<string, string>> {
    const raw = process.env.CODEMATION_RUNTIME_CHILD_ENV_JSON;
    if (!raw || raw.trim().length === 0) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid CODEMATION_RUNTIME_CHILD_ENV_JSON.");
    }
    const entries = Object.entries(parsed);
    if (entries.some(([, value]: Readonly<[string, unknown]>) => typeof value !== "string")) {
      throw new Error("Invalid CODEMATION_RUNTIME_CHILD_ENV_JSON.");
    }
    return Object.fromEntries(entries) as Record<string, string>;
  }

  private async waitForChildHealth(): Promise<void> {
    const base = `http://127.0.0.1:${this.childHttpPort}`;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      try {
        const response = await fetch(`${base}/health`);
        if (response.ok) {
          return;
        }
      } catch {
        // not ready
      }
      await delay(50);
    }
    throw new Error("Timed out waiting for runtime child /health.");
  }

  private async resolveFreePortOnLoopback(): Promise<number> {
    return await new Promise<number>((resolve, reject) => {
      const server = createNetServer();
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        server.close(() => {
          if (address && typeof address === "object") {
            resolve(address.port);
            return;
          }
          reject(new Error("Failed to resolve a free TCP port."));
        });
      });
    });
  }

  private async shutdown(server: import("node:http").Server): Promise<void> {
    await this.killChild();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    process.exit(0);
  }
}
