import { WebSocket, WebSocketServer } from "ws";
import type { WorkflowWebsocketMessage } from "../../application/contracts/WorkflowWebsocketMessage";
import type { WorkflowWebsocketPublisher } from "../../application/websocket/WorkflowWebsocketPublisher";
import { ApiPaths } from "../http/ApiPaths";

type WorkflowWebsocketClientMessage =
  | Readonly<{ kind: "subscribe"; roomId: string }>
  | Readonly<{ kind: "unsubscribe"; roomId: string }>;

type WorkflowWebsocketControlMessage =
  | Readonly<{ kind: "ready" }>
  | Readonly<{ kind: "subscribed"; roomId: string }>
  | Readonly<{ kind: "unsubscribed"; roomId: string }>
  | Readonly<{ kind: "error"; message: string }>;

type WorkflowWebsocketServerMessage = WorkflowWebsocketControlMessage | WorkflowWebsocketMessage;

export class WorkflowWebsocketServer implements WorkflowWebsocketPublisher {
  private websocketServer: WebSocketServer | null = null;
  private readonly sockets = new Set<WebSocket>();
  private readonly roomIdsBySocket = new Map<WebSocket, Set<string>>();
  private started = false;

  constructor(
    private readonly port: number,
    private readonly bindHost: string,
  ) {}

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    const websocketServer = new WebSocketServer({
      host: this.bindHost,
      port: this.port,
      path: ApiPaths.workflowWebsocket(),
    });
    this.websocketServer = websocketServer;
    websocketServer.on("connection", (socket) => {
      void this.connect(socket);
    });
    try {
      await this.awaitListening(websocketServer);
    } catch (error) {
      this.websocketServer = null;
      await this.closeAfterFailedStart(websocketServer);
      throw error;
    }
    this.logInfo(`listening on ws://${this.bindHost}:${this.port}${ApiPaths.workflowWebsocket()}`);
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.websocketServer) {
      return;
    }
    this.started = false;
    for (const socket of this.sockets) {
      socket.removeAllListeners();
      socket.terminate();
    }
    this.sockets.clear();
    this.roomIdsBySocket.clear();
    const websocketServer = this.websocketServer;
    this.websocketServer = null;
    await new Promise<void>((resolve, reject) => {
      websocketServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  async publishToRoom(roomId: string, message: WorkflowWebsocketMessage): Promise<void> {
    let deliveredSocketCount = 0;
    for (const [socket, roomIds] of this.roomIdsBySocket) {
      if (socket.readyState !== WebSocket.OPEN || !roomIds.has(roomId)) {
        continue;
      }
      socket.send(JSON.stringify(message satisfies WorkflowWebsocketServerMessage));
      deliveredSocketCount += 1;
    }
    if (message.kind === "event") {
      const event = message.event;
      const eventLabel =
        "snapshot" in event && event.snapshot
          ? `${event.kind}:${event.runId}:${event.snapshot.nodeId}:${event.snapshot.status}`
          : `${event.kind}:${event.runId}`;
      this.logInfo(`published room=${roomId} sockets=${deliveredSocketCount} event=${eventLabel}`);
      return;
    }
    this.logInfo(`published room=${roomId} sockets=${deliveredSocketCount} kind=${message.kind}`);
  }

  private async connect(socket: WebSocket): Promise<void> {
    this.sockets.add(socket);
    this.roomIdsBySocket.set(socket, new Set());
    this.logInfo(`client connected activeSockets=${this.sockets.size}`);
    socket.send(JSON.stringify({ kind: "ready" } satisfies WorkflowWebsocketServerMessage));
    socket.on("message", (rawData) => {
      void this.handleMessage(socket, rawData);
    });
    socket.on("close", () => {
      this.sockets.delete(socket);
      this.roomIdsBySocket.delete(socket);
      this.logInfo(`client disconnected activeSockets=${this.sockets.size}`);
    });
    socket.on("error", () => {
      this.sockets.delete(socket);
      this.roomIdsBySocket.delete(socket);
      this.logWarn(`client socket error activeSockets=${this.sockets.size}`);
    });
  }

  private async handleMessage(socket: WebSocket, rawData: unknown): Promise<void> {
    try {
      const message = this.parseClientMessage(rawData);
      if (message.kind === "subscribe") {
        this.roomIdsBySocket.get(socket)?.add(message.roomId);
        this.logInfo(`subscribed room=${message.roomId}`);
        socket.send(JSON.stringify({ kind: "subscribed", roomId: message.roomId } satisfies WorkflowWebsocketServerMessage));
        return;
      }
      this.roomIdsBySocket.get(socket)?.delete(message.roomId);
      this.logInfo(`unsubscribed room=${message.roomId}`);
      socket.send(JSON.stringify({ kind: "unsubscribed", roomId: message.roomId } satisfies WorkflowWebsocketServerMessage));
    } catch (error) {
      const exception = error instanceof Error ? error : new Error(String(error));
      this.logWarn(`failed to handle client message: ${exception.message}`);
      socket.send(JSON.stringify({ kind: "error", message: exception.message } satisfies WorkflowWebsocketServerMessage));
    }
  }

  private async awaitListening(websocketServer: WebSocketServer): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      websocketServer.once("listening", () => resolve());
      websocketServer.once("error", reject);
    });
  }

  private async closeAfterFailedStart(websocketServer: WebSocketServer): Promise<void> {
    await new Promise<void>((resolve) => {
      websocketServer.close(() => resolve());
    });
  }

  private parseClientMessage(rawData: unknown): WorkflowWebsocketClientMessage {
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

  private logInfo(message: string): void {
    console.info(`[codemation-websocket.server] ${message}`);
  }

  private logWarn(message: string): void {
    console.warn(`[codemation-websocket.server] ${message}`);
  }
}
