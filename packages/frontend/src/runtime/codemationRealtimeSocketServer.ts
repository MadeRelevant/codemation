import { watch, type FSWatcher } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { RunEvent, RunEventBus, RunEventSubscription } from "@codemation/core";
import { injectable } from "@codemation/core";
import { WebSocket, WebSocketServer } from "ws";
import { CodemationRuntimeTrackedPaths } from "./codemationRuntimeTrackedPaths";

type RealtimeClientMessage =
  | Readonly<{ kind: "subscribeWorkflow"; workflowId: string }>
  | Readonly<{ kind: "unsubscribeWorkflow"; workflowId: string }>;

type RealtimeServerMessage =
  | Readonly<{ kind: "ready" }>
  | Readonly<{ kind: "subscribed"; workflowId: string }>
  | Readonly<{ kind: "unsubscribed"; workflowId: string }>
  | Readonly<{ kind: "workflowChanged"; workflowId: string }>
  | Readonly<{ kind: "event"; event: RunEvent }>
  | Readonly<{ kind: "error"; message: string }>;

@injectable()
export class CodemationRealtimeSocketServer {
  private websocketServer: WebSocketServer | null = null;
  private readonly sockets = new Set<WebSocket>();
  private readonly subscribedWorkflowIdsBySocket = new Map<WebSocket, Set<string>>();
  private readonly watchers = new Map<string, FSWatcher>();
  private changeBroadcastTimeout: NodeJS.Timeout | null = null;
  private started = false;

  constructor(
    private readonly eventBus: RunEventBus,
    private readonly port: number,
    private readonly bindHost: string,
    private readonly watchRoots: ReadonlyArray<string>,
  ) {}

  async start(): Promise<void> {
    if (this.started) return;
    await this.refreshWatchers();
    this.websocketServer = new WebSocketServer({
      host: this.bindHost,
      port: this.port,
      path: "/api/workflows/ws",
    });
    this.websocketServer.on("connection", (socket) => {
      void this.connect(socket);
    });
    await new Promise<void>((resolve, reject) => {
      this.websocketServer!.once("listening", () => resolve());
      this.websocketServer!.once("error", reject);
    });
    this.logInfo(`listening on ws://${this.bindHost}:${this.port}/api/workflows/ws`);
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.websocketServer) return;
    this.started = false;
    this.clearPendingWorkflowChangedBroadcast();
    this.closeWatchers();
    for (const socket of this.sockets) {
      socket.removeAllListeners();
      socket.terminate();
    }
    this.sockets.clear();
    this.subscribedWorkflowIdsBySocket.clear();
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

  getPort(): number {
    return this.port;
  }

  private async connect(socket: WebSocket): Promise<void> {
    const subscriptions = new Map<string, RunEventSubscription>();
    this.sockets.add(socket);
    this.subscribedWorkflowIdsBySocket.set(socket, new Set());
    this.logInfo(`client connected activeSockets=${this.sockets.size}`);
    socket.send(JSON.stringify({ kind: "ready" } satisfies RealtimeServerMessage));
    socket.on("message", (rawData) => {
      void this.handleMessage(socket, subscriptions, rawData);
    });
    socket.on("close", () => {
      this.sockets.delete(socket);
      this.subscribedWorkflowIdsBySocket.delete(socket);
      this.logInfo(`client disconnected activeSockets=${this.sockets.size}`);
      void this.closeSubscriptions(subscriptions);
    });
    socket.on("error", () => {
      this.sockets.delete(socket);
      this.subscribedWorkflowIdsBySocket.delete(socket);
      this.logWarn(`client socket error activeSockets=${this.sockets.size}`);
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
      this.logWarn(`failed to handle client message: ${exception.message}`);
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
    this.subscribedWorkflowIdsBySocket.get(socket)?.add(workflowId);
    if (subscriptions.has(workflowId)) {
      this.logInfo(`client already subscribed workflow=${workflowId}`);
      socket.send(JSON.stringify({ kind: "subscribed", workflowId } satisfies RealtimeServerMessage));
      return;
    }
    const subscription = await this.eventBus.subscribeToWorkflow(workflowId, (event) => {
      this.logInfo(`broadcast event workflow=${workflowId} kind=${event.kind}`);
      socket.send(JSON.stringify({ kind: "event", event } satisfies RealtimeServerMessage));
    });
    subscriptions.set(workflowId, subscription);
    this.logInfo(`subscribed workflow=${workflowId}`);
    socket.send(JSON.stringify({ kind: "subscribed", workflowId } satisfies RealtimeServerMessage));
  }

  private async unsubscribeWorkflow(socket: WebSocket, subscriptions: Map<string, RunEventSubscription>, workflowId: string): Promise<void> {
    this.subscribedWorkflowIdsBySocket.get(socket)?.delete(workflowId);
    const subscription = subscriptions.get(workflowId);
    if (!subscription) {
      socket.send(JSON.stringify({ kind: "unsubscribed", workflowId } satisfies RealtimeServerMessage));
      return;
    }
    subscriptions.delete(workflowId);
    await subscription.close();
    this.logInfo(`unsubscribed workflow=${workflowId}`);
    socket.send(JSON.stringify({ kind: "unsubscribed", workflowId } satisfies RealtimeServerMessage));
  }

  private async closeSubscriptions(subscriptions: Map<string, RunEventSubscription>): Promise<void> {
    for (const subscription of subscriptions.values()) {
      await subscription.close();
    }
    subscriptions.clear();
  }

  private async refreshWatchers(): Promise<void> {
    const nextWatchDirectories = new Set<string>();
    for (const watchRoot of this.watchRoots) {
      await this.collectWatchDirectories(watchRoot, nextWatchDirectories);
    }

    for (const [watchDirectory, watcher] of this.watchers) {
      if (nextWatchDirectories.has(watchDirectory)) {
        continue;
      }
      watcher.close();
      this.watchers.delete(watchDirectory);
    }

    for (const watchDirectory of nextWatchDirectories) {
      if (this.watchers.has(watchDirectory)) {
        continue;
      }
      const watcher = watch(watchDirectory, (_, fileName) => {
        const changedPath =
          typeof fileName === "string" && fileName.length > 0 ? path.resolve(watchDirectory, fileName) : watchDirectory;
        if (CodemationRuntimeTrackedPaths.shouldTrack(changedPath)) {
          this.scheduleWorkflowChangedBroadcast();
        }
        void this.refreshWatchers();
      });
      this.watchers.set(watchDirectory, watcher);
    }
  }

  private async collectWatchDirectories(targetPath: string, watchDirectories: Set<string>): Promise<void> {
    try {
      const targetStats = await stat(targetPath);
      if (!targetStats.isDirectory()) {
        if (CodemationRuntimeTrackedPaths.shouldTrack(targetPath)) {
          watchDirectories.add(path.dirname(targetPath));
        }
        return;
      }
      if (!CodemationRuntimeTrackedPaths.shouldTrack(targetPath)) {
        return;
      }
      watchDirectories.add(targetPath);
      const entries = await readdir(targetPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        await this.collectWatchDirectories(path.resolve(targetPath, entry.name), watchDirectories);
      }
    } catch {
      // Ignore missing paths; they may not exist in every consumer workspace.
    }
  }

  private closeWatchers(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
  }

  private scheduleWorkflowChangedBroadcast(): void {
    if (this.changeBroadcastTimeout) {
      clearTimeout(this.changeBroadcastTimeout);
    }
    this.changeBroadcastTimeout = setTimeout(() => {
      this.changeBroadcastTimeout = null;
      this.broadcastWorkflowChanged();
    }, 75);
  }

  private clearPendingWorkflowChangedBroadcast(): void {
    if (!this.changeBroadcastTimeout) {
      return;
    }
    clearTimeout(this.changeBroadcastTimeout);
    this.changeBroadcastTimeout = null;
  }

  private broadcastWorkflowChanged(): void {
    for (const [socket, workflowIds] of this.subscribedWorkflowIdsBySocket) {
      if (socket.readyState !== WebSocket.OPEN) {
        continue;
      }
      for (const workflowId of workflowIds) {
        this.logInfo(`broadcast workflowChanged workflow=${workflowId}`);
        socket.send(JSON.stringify({ kind: "workflowChanged", workflowId } satisfies RealtimeServerMessage));
      }
    }
  }

  private logInfo(message: string): void {
    console.info(`[codemation-realtime.server] ${message}`);
  }

  private logWarn(message: string): void {
    console.warn(`[codemation-realtime.server] ${message}`);
  }
}
