import type { RunEvent, RunEventBus, RunEventSubscription } from "@codemation/core";
import { injectable } from "@codemation/core";
import { WebSocketServer, type WebSocket } from "ws";

type RealtimeClientMessage =
  | Readonly<{ kind: "subscribeWorkflow"; workflowId: string }>
  | Readonly<{ kind: "unsubscribeWorkflow"; workflowId: string }>;

type RealtimeServerMessage =
  | Readonly<{ kind: "ready" }>
  | Readonly<{ kind: "subscribed"; workflowId: string }>
  | Readonly<{ kind: "unsubscribed"; workflowId: string }>
  | Readonly<{ kind: "event"; event: RunEvent }>
  | Readonly<{ kind: "error"; message: string }>;

@injectable()
export class CodemationRealtimeSocketServer {
  private readonly websocketServer: WebSocketServer;

  constructor(
    private readonly eventBus: RunEventBus,
    private readonly port: number,
    private readonly bindHost: string,
  ) {
    this.websocketServer = new WebSocketServer({
      host: bindHost,
      port,
      path: "/api/workflows/ws",
    });
  }

  async start(): Promise<void> {
    this.websocketServer.on("connection", (socket) => {
      void this.connect(socket);
    });
    await new Promise<void>((resolve, reject) => {
      this.websocketServer.once("listening", () => resolve());
      this.websocketServer.once("error", reject);
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.websocketServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  getPort(): number {
    return this.port;
  }

  private async connect(socket: WebSocket): Promise<void> {
    const subscriptions = new Map<string, RunEventSubscription>();
    socket.send(JSON.stringify({ kind: "ready" } satisfies RealtimeServerMessage));
    socket.on("message", (rawData) => {
      void this.handleMessage(socket, subscriptions, rawData);
    });
    socket.on("close", () => {
      void this.closeSubscriptions(subscriptions);
    });
    socket.on("error", () => {
      void this.closeSubscriptions(subscriptions);
    });
  }

  private async handleMessage(socket: WebSocket, subscriptions: Map<string, RunEventSubscription>, rawData: unknown): Promise<void> {
    try {
      const message = this.parseClientMessage(rawData);
      if (message.kind === "subscribeWorkflow") {
        await this.subscribeWorkflow(socket, subscriptions, message.workflowId);
        return;
      }
      await this.unsubscribeWorkflow(socket, subscriptions, message.workflowId);
    } catch (error) {
      const exception = error instanceof Error ? error : new Error(String(error));
      socket.send(JSON.stringify({ kind: "error", message: exception.message } satisfies RealtimeServerMessage));
    }
  }

  private parseClientMessage(rawData: unknown): RealtimeClientMessage {
    const value = typeof rawData === "string" ? rawData : Buffer.isBuffer(rawData) ? rawData.toString("utf8") : "";
    const message = JSON.parse(value) as Readonly<{ kind?: unknown; workflowId?: unknown }>;
    if (message.kind === "subscribeWorkflow" && typeof message.workflowId === "string") {
      return { kind: "subscribeWorkflow", workflowId: message.workflowId };
    }
    if (message.kind === "unsubscribeWorkflow" && typeof message.workflowId === "string") {
      return { kind: "unsubscribeWorkflow", workflowId: message.workflowId };
    }
    throw new Error("Unsupported realtime client message.");
  }

  private async subscribeWorkflow(socket: WebSocket, subscriptions: Map<string, RunEventSubscription>, workflowId: string): Promise<void> {
    if (subscriptions.has(workflowId)) {
      socket.send(JSON.stringify({ kind: "subscribed", workflowId } satisfies RealtimeServerMessage));
      return;
    }
    const subscription = await this.eventBus.subscribeToWorkflow(workflowId, (event) => {
      socket.send(JSON.stringify({ kind: "event", event } satisfies RealtimeServerMessage));
    });
    subscriptions.set(workflowId, subscription);
    socket.send(JSON.stringify({ kind: "subscribed", workflowId } satisfies RealtimeServerMessage));
  }

  private async unsubscribeWorkflow(socket: WebSocket, subscriptions: Map<string, RunEventSubscription>, workflowId: string): Promise<void> {
    const subscription = subscriptions.get(workflowId);
    if (!subscription) {
      socket.send(JSON.stringify({ kind: "unsubscribed", workflowId } satisfies RealtimeServerMessage));
      return;
    }
    subscriptions.delete(workflowId);
    await subscription.close();
    socket.send(JSON.stringify({ kind: "unsubscribed", workflowId } satisfies RealtimeServerMessage));
  }

  private async closeSubscriptions(subscriptions: Map<string, RunEventSubscription>): Promise<void> {
    for (const subscription of subscriptions.values()) {
      await subscription.close();
    }
    subscriptions.clear();
  }
}
