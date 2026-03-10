import type {
  Container,
  CredentialService,
  EngineHost,
  HttpMethod,
  Items,
  NodeDefinition,
  NodeId,
  ParentExecutionRef,
  PersistedRunState,
  RunEvent,
  RunEventBus,
  RunListingStore,
  RunStateStore,
  RunSummary,
  WebhookRegistration,
  WorkflowDefinition,
  WorkflowId,
} from "@codemation/core";
import { Engine, EngineWorkflowRunnerService } from "@codemation/core";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import type { RealtimeRuntime } from "./realtimeRuntimeFactory";

export interface CodemationHostServerLogger {
  info(message: string, exception?: Error): void;
  warn(message: string, exception?: Error): void;
  error(message: string, exception?: Error): void;
  debug(message: string, exception?: Error): void;
}

export interface CodemationFrontendHostServerArgs {
  readonly container: Container;
  readonly credentials: CredentialService;
  readonly workflows: ReadonlyArray<WorkflowDefinition>;
  readonly runtime: RealtimeRuntime;
  readonly port: number;
  readonly bindHost: string;
  readonly logger: CodemationHostServerLogger;
}

export interface CodemationFrontendHostServerDiagnostics {
  readonly apiBaseUrl: string;
  readonly websocketUrl: string;
  readonly listening: boolean;
  readonly server: Readonly<{
    host: string | null;
    port: number | null;
    totalConnectionsAccepted: number;
    activeConnections: number;
    startedAt: string | null;
    lastListeningAt: string | null;
    lastConnectionAt: string | null;
    lastCloseAt: string | null;
    lastError: string | null;
  }>;
  readonly hub: Readonly<{
    connectedClients: number;
    workflowSocketCounts: Readonly<Record<string, number>>;
    workflowEventSubscriptions: ReadonlyArray<string>;
  }>;
  readonly runtime: Readonly<{
    mode: string;
    eventBusKind: string;
    schedulerKind: string;
    dbPath: string;
    queuePrefix?: string;
    redisUrl?: string;
  }>;
}

class CodemationWebhookRegistry {
  private readonly handlersByEndpointId = new Map<string, Readonly<{ method: string; handler: (req: unknown) => Promise<Items> }>>();

  register(args: { endpointId: string; method: string; handler: (req: unknown) => Promise<Items> }): void {
    this.handlersByEndpointId.set(args.endpointId, { method: args.method, handler: args.handler });
  }

  get(endpointId: string): Readonly<{ method: string; handler: (req: unknown) => Promise<Items> }> | undefined {
    return this.handlersByEndpointId.get(endpointId);
  }
}

class CodemationServerEngineHost implements EngineHost {
  workflows: EngineWorkflowRunnerService | undefined;

  constructor(
    public readonly credentials: CredentialService,
    private readonly webhookRegistry: CodemationWebhookRegistry,
    private readonly webhookBasePath: string,
  ) {}

  registerWebhook(spec: {
    workflowId: WorkflowId;
    nodeId: NodeId;
    endpointKey: string;
    method: HttpMethod;
    handler: (req: unknown) => Promise<Items>;
    basePath: string;
  }): WebhookRegistration {
    const endpointId = `${spec.workflowId}.${spec.nodeId}.${spec.endpointKey}`;
    const path = `${this.webhookBasePath}/${endpointId}`;
    this.webhookRegistry.register({ endpointId, method: spec.method, handler: spec.handler });
    return { endpointId, method: spec.method, path };
  }

  onNodeActivation(): void {}
}

class CodemationIdFactory {
  static makeRunId(): string {
    return `run_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  static makeActivationId(): string {
    return `act_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

class CodemationWorkflowRealtimeClient {
  readonly workflowIds = new Set<WorkflowId>();

  constructor(public readonly socket: WebSocket) {}
}

class CodemationWorkflowRealtimeProtocol {
  static parseClientMessage(raw: string): Readonly<{ kind: "subscribeWorkflow" | "unsubscribeWorkflow"; workflowId: WorkflowId }> {
    const parsed = JSON.parse(raw) as Partial<Readonly<{ kind: "subscribeWorkflow" | "unsubscribeWorkflow"; workflowId: WorkflowId }>>;
    if (parsed.kind === "subscribeWorkflow" && typeof parsed.workflowId === "string") return { kind: parsed.kind, workflowId: parsed.workflowId };
    if (parsed.kind === "unsubscribeWorkflow" && typeof parsed.workflowId === "string") return { kind: parsed.kind, workflowId: parsed.workflowId };
    throw new Error("Unsupported realtime message");
  }

  static stringify(message: unknown): string {
    return JSON.stringify(message);
  }
}

class CodemationWorkflowRealtimeHub {
  private readonly clientsBySocket = new Map<WebSocket, CodemationWorkflowRealtimeClient>();
  private readonly socketsByWorkflowId = new Map<WorkflowId, Set<WebSocket>>();
  private readonly subscriptionsByWorkflowId = new Map<WorkflowId, Awaited<ReturnType<RunEventBus["subscribeToWorkflow"]>>>();
  private readonly subscriptionPromisesByWorkflowId = new Map<WorkflowId, Promise<Awaited<ReturnType<RunEventBus["subscribeToWorkflow"]>>>>();

  constructor(
    private readonly eventBus: RunEventBus,
    private readonly logger: CodemationHostServerLogger,
  ) {}

  connect(socket: WebSocket): void {
    const client = new CodemationWorkflowRealtimeClient(socket);
    this.clientsBySocket.set(socket, client);
    this.logger.info("websocket client connected");

    socket.on("message", (data) => {
      void this.onMessage(client, data);
    });
    socket.on("close", () => {
      this.logger.info("websocket client disconnected");
      void this.disconnect(client);
    });
    socket.on("error", (error) => {
      this.logger.error("websocket client errored", error instanceof Error ? error : undefined);
      void this.disconnect(client);
    });

    this.send(socket, { kind: "ready" });
  }

  getDiagnostics(): Readonly<{
    connectedClients: number;
    workflowSocketCounts: Readonly<Record<string, number>>;
    workflowEventSubscriptions: ReadonlyArray<string>;
  }> {
    return {
      connectedClients: this.clientsBySocket.size,
      workflowSocketCounts: Object.fromEntries([...this.socketsByWorkflowId.entries()].map(([workflowId, sockets]) => [workflowId, sockets.size])),
      workflowEventSubscriptions: [...this.subscriptionsByWorkflowId.keys()],
    };
  }

  private async onMessage(client: CodemationWorkflowRealtimeClient, rawData: unknown): Promise<void> {
    const payload = typeof rawData === "string" ? rawData : rawData instanceof Buffer ? rawData.toString("utf8") : undefined;
    if (!payload) {
      this.send(client.socket, { kind: "error", message: "Realtime messages must be JSON strings" });
      this.logger.warn("rejected non-string websocket payload");
      return;
    }

    try {
      const message = CodemationWorkflowRealtimeProtocol.parseClientMessage(payload);
      if (message.kind === "subscribeWorkflow") {
        await this.subscribeClientToWorkflow(client, message.workflowId);
        return;
      }
      await this.unsubscribeClientFromWorkflow(client, message.workflowId);
    } catch (error) {
      const exception = error instanceof Error ? error : new Error(String(error));
      this.send(client.socket, { kind: "error", message: exception.message });
      this.logger.error("failed to handle websocket message", exception);
    }
  }

  private async subscribeClientToWorkflow(client: CodemationWorkflowRealtimeClient, workflowId: WorkflowId): Promise<void> {
    if (client.workflowIds.has(workflowId)) {
      this.send(client.socket, { kind: "subscribed", workflowId });
      return;
    }

    client.workflowIds.add(workflowId);
    const sockets = this.socketsByWorkflowId.get(workflowId) ?? new Set<WebSocket>();
    sockets.add(client.socket);
    this.socketsByWorkflowId.set(workflowId, sockets);

    await this.ensureWorkflowSubscription(workflowId);
    this.logger.info(`subscribed websocket client to workflow ${workflowId}`);
    this.send(client.socket, { kind: "subscribed", workflowId });
  }

  private async unsubscribeClientFromWorkflow(client: CodemationWorkflowRealtimeClient, workflowId: WorkflowId): Promise<void> {
    if (!client.workflowIds.has(workflowId)) {
      this.send(client.socket, { kind: "unsubscribed", workflowId });
      return;
    }

    client.workflowIds.delete(workflowId);
    this.removeSocketFromWorkflow(workflowId, client.socket);
    await this.maybeCloseWorkflowSubscription(workflowId);
    this.logger.info(`unsubscribed websocket client from workflow ${workflowId}`);
    this.send(client.socket, { kind: "unsubscribed", workflowId });
  }

  private async disconnect(client: CodemationWorkflowRealtimeClient): Promise<void> {
    if (!this.clientsBySocket.has(client.socket)) return;
    this.clientsBySocket.delete(client.socket);

    for (const workflowId of client.workflowIds) {
      this.removeSocketFromWorkflow(workflowId, client.socket);
      await this.maybeCloseWorkflowSubscription(workflowId);
    }
    client.workflowIds.clear();
  }

  private async ensureWorkflowSubscription(workflowId: WorkflowId): Promise<void> {
    if (this.subscriptionsByWorkflowId.has(workflowId)) return;
    const existingPromise = this.subscriptionPromisesByWorkflowId.get(workflowId);
    if (existingPromise) {
      await existingPromise;
      return;
    }

    const promise = this.eventBus.subscribeToWorkflow(workflowId, (event) => {
      this.logger.debug(`broadcasting workflow event ${event.kind} for ${workflowId}`);
      this.broadcast(workflowId, { kind: "event", event });
    });
    this.subscriptionPromisesByWorkflowId.set(workflowId, promise);

    try {
      const subscription = await promise;
      this.subscriptionsByWorkflowId.set(workflowId, subscription);
    } finally {
      this.subscriptionPromisesByWorkflowId.delete(workflowId);
    }
  }

  private async maybeCloseWorkflowSubscription(workflowId: WorkflowId): Promise<void> {
    if ((this.socketsByWorkflowId.get(workflowId)?.size ?? 0) > 0) return;
    const pending = this.subscriptionPromisesByWorkflowId.get(workflowId);
    if (pending) await pending;
    const subscription = this.subscriptionsByWorkflowId.get(workflowId);
    if (!subscription) return;
    this.subscriptionsByWorkflowId.delete(workflowId);
    await subscription.close();
  }

  private removeSocketFromWorkflow(workflowId: WorkflowId, socket: WebSocket): void {
    const sockets = this.socketsByWorkflowId.get(workflowId);
    if (!sockets) return;
    sockets.delete(socket);
    if (sockets.size === 0) this.socketsByWorkflowId.delete(workflowId);
  }

  private broadcast(workflowId: WorkflowId, message: Readonly<{ kind: "event"; event: RunEvent }>): void {
    for (const socket of this.socketsByWorkflowId.get(workflowId) ?? []) {
      this.send(socket, message);
    }
  }

  private send(
    socket: WebSocket,
    message:
      | Readonly<{ kind: "ready" }>
      | Readonly<{ kind: "subscribed"; workflowId: WorkflowId }>
      | Readonly<{ kind: "unsubscribed"; workflowId: WorkflowId }>
      | Readonly<{ kind: "event"; event: RunEvent }>
      | Readonly<{ kind: "error"; message: string }>,
  ): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(CodemationWorkflowRealtimeProtocol.stringify(message));
  }
}

class CodemationWorkflowDtoMapper {
  toSummary(workflow: WorkflowDefinition): Readonly<{ id: string; name: string }> {
    return { id: workflow.id, name: workflow.name };
  }

  toDetail(workflow: WorkflowDefinition): Readonly<{
    id: string;
    name: string;
    nodes: ReadonlyArray<Readonly<{ id: string; kind: string; name?: string; type: string }>>;
    edges: WorkflowDefinition["edges"];
  }> {
    return {
      id: workflow.id,
      name: workflow.name,
      nodes: workflow.nodes.map((node) => ({
        id: node.id,
        kind: node.kind,
        name: node.name ?? node.config?.name,
        type: this.nodeTypeName(node),
      })),
      edges: workflow.edges,
    };
  }

  private nodeTypeName(node: NodeDefinition): string {
    const configToken = node.config?.token as unknown as Readonly<{ name?: unknown }> | undefined;
    if (typeof configToken?.name === "string" && configToken.name) return configToken.name;
    const nodeToken = node.token as unknown as Readonly<{ name?: unknown }> | undefined;
    if (typeof nodeToken?.name === "string" && nodeToken.name) return nodeToken.name;
    return "Node";
  }
}

class CodemationJsonResponseWriter {
  write(response: ServerResponse, statusCode: number, body: unknown): void {
    const payload = JSON.stringify(body);
    response.statusCode = statusCode;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(payload);
  }
}

class CodemationTextResponseWriter {
  write(response: ServerResponse, statusCode: number, body: string): void {
    response.statusCode = statusCode;
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.end(body);
  }
}

class CodemationRequestBodyReader {
  async readJson(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    if (chunks.length === 0) return {};
    const payload = Buffer.concat(chunks).toString("utf8");
    if (!payload) return {};
    return JSON.parse(payload);
  }
}

class CodemationPathMatcher {
  getPathname(request: IncomingMessage): string {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    return url.pathname;
  }

  getWorkflowIdFromRunsPath(pathname: string): string | null {
    const match = /^\/api\/workflows\/([^/]+)\/runs$/.exec(pathname);
    return match ? decodeURIComponent(match[1] ?? "") : null;
  }

  getWorkflowIdFromDetailPath(pathname: string): string | null {
    const match = /^\/api\/workflows\/([^/]+)$/.exec(pathname);
    return match ? decodeURIComponent(match[1] ?? "") : null;
  }

  getRunId(pathname: string): string | null {
    const match = /^\/api\/runs\/([^/]+)$/.exec(pathname);
    return match ? decodeURIComponent(match[1] ?? "") : null;
  }

  getWebhookEndpointId(pathname: string): string | null {
    const match = /^\/api\/webhooks\/([^/]+)$/.exec(pathname);
    return match ? decodeURIComponent(match[1] ?? "") : null;
  }
}

class CodemationSseSession {
  constructor(
    private readonly response: ServerResponse,
    private readonly eventBus: RunEventBus,
    private readonly logger: CodemationHostServerLogger,
  ) {}

  async start(): Promise<void> {
    this.response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    });
    this.response.write("event: ready\ndata: {}\n\n");
    const subscription = await this.eventBus.subscribe((event) => {
      this.response.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    this.response.on("close", () => {
      void subscription.close();
    });
    this.logger.debug("opened SSE event stream");
  }
}

export class CodemationFrontendHostServer {
  private readonly webhookRegistry = new CodemationWebhookRegistry();
  private readonly workflowDtoMapper = new CodemationWorkflowDtoMapper();
  private readonly jsonResponseWriter = new CodemationJsonResponseWriter();
  private readonly textResponseWriter = new CodemationTextResponseWriter();
  private readonly bodyReader = new CodemationRequestBodyReader();
  private readonly pathMatcher = new CodemationPathMatcher();
  private readonly workflowsById: Map<WorkflowId, WorkflowDefinition>;
  private readonly realtimeHub: CodemationWorkflowRealtimeHub;
  private readonly host: CodemationServerEngineHost;
  private readonly engine: Engine;
  private readonly websocketServer = new WebSocketServer({ noServer: true });
  private httpServer: HttpServer | undefined;
  private totalConnectionsAccepted = 0;
  private activeConnections = 0;
  private startedAt: string | undefined;
  private lastListeningAt: string | undefined;
  private lastConnectionAt: string | undefined;
  private lastCloseAt: string | undefined;
  private lastError: string | undefined;
  private started = false;

  constructor(private readonly args: CodemationFrontendHostServerArgs) {
    this.workflowsById = new Map(args.workflows.map((workflow) => [workflow.id, workflow] as const));
    this.realtimeHub = new CodemationWorkflowRealtimeHub(args.runtime.eventBus, args.logger);
    this.host = new CodemationServerEngineHost(args.credentials, this.webhookRegistry, "/api/webhooks");
    this.engine = new Engine(
      args.container,
      this.host as EngineHost,
      CodemationIdFactory.makeRunId as never,
      CodemationIdFactory.makeActivationId as never,
      "/api/webhooks",
      args.runtime.runStore,
      args.runtime.activationScheduler,
      args.runtime.scheduler,
      undefined,
      undefined,
      undefined,
      args.runtime.eventBus,
    );
    this.host.workflows = new EngineWorkflowRunnerService(this.engine, this.workflowsById);
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.engine.loadWorkflows([...this.workflowsById.values()]);
    await this.engine.startTriggers();
    this.httpServer = createServer((request, response) => {
      void this.handleRequest(request, response);
    });
    this.httpServer.on("upgrade", (request, socket, head) => {
      this.handleUpgrade(request, socket, head);
    });
    this.httpServer.on("error", (error) => {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.args.logger.error("codemation host server errored", error instanceof Error ? error : undefined);
    });
    await new Promise<void>((resolve, reject) => {
      this.httpServer!.once("error", reject);
      this.httpServer!.listen(this.args.port, this.args.bindHost, () => {
        this.startedAt = new Date().toISOString();
        this.lastListeningAt = this.startedAt;
        this.args.logger.info(`codemation host server listening on ${this.args.bindHost}:${this.args.port}`);
        resolve();
      });
    });
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.httpServer) return;
    this.lastCloseAt = new Date().toISOString();
    await new Promise<void>((resolve, reject) => {
      this.httpServer!.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    this.websocketServer.close();
    this.httpServer = undefined;
    this.started = false;
  }

  getApiBaseUrl(): string {
    return `http://127.0.0.1:${this.args.port}`;
  }

  getWebSocketUrl(): string {
    return `ws://127.0.0.1:${this.args.port}/api/workflows/ws`;
  }

  getDiagnostics(): CodemationFrontendHostServerDiagnostics {
    return {
      apiBaseUrl: this.getApiBaseUrl(),
      websocketUrl: this.getWebSocketUrl(),
      listening: Boolean(this.httpServer?.listening),
      server: {
        host: this.args.bindHost,
        port: this.args.port,
        totalConnectionsAccepted: this.totalConnectionsAccepted,
        activeConnections: this.activeConnections,
        startedAt: this.startedAt ?? null,
        lastListeningAt: this.lastListeningAt ?? null,
        lastConnectionAt: this.lastConnectionAt ?? null,
        lastCloseAt: this.lastCloseAt ?? null,
        lastError: this.lastError ?? null,
      },
      hub: this.realtimeHub.getDiagnostics(),
      runtime: {
        mode: this.args.runtime.diagnostics.mode,
        eventBusKind: this.args.runtime.diagnostics.eventBusKind,
        schedulerKind: this.args.runtime.diagnostics.schedulerKind,
        dbPath: this.args.runtime.diagnostics.dbPath,
        queuePrefix: this.args.runtime.diagnostics.queuePrefix,
        redisUrl: this.args.runtime.diagnostics.redisUrl,
      },
    };
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const pathname = this.pathMatcher.getPathname(request);
      if (request.method === "GET" && pathname === "/api/workflows") {
        this.jsonResponseWriter.write(response, 200, [...this.workflowsById.values()].map((workflow) => this.workflowDtoMapper.toSummary(workflow)));
        return;
      }
      if (request.method === "GET" && pathname === "/api/events") {
        await new CodemationSseSession(response, this.args.runtime.eventBus, this.args.logger).start();
        return;
      }

      const workflowRunsWorkflowId = this.pathMatcher.getWorkflowIdFromRunsPath(pathname);
      if (request.method === "GET" && workflowRunsWorkflowId) {
        const listingStore = this.args.runtime.runStore as unknown as Partial<RunListingStore>;
        const runs: ReadonlyArray<RunSummary> = listingStore.listRuns ? await listingStore.listRuns({ workflowId: workflowRunsWorkflowId, limit: 50 }) : [];
        this.jsonResponseWriter.write(response, 200, runs);
        return;
      }

      const workflowId = this.pathMatcher.getWorkflowIdFromDetailPath(pathname);
      if (request.method === "GET" && workflowId) {
        const workflow = this.workflowsById.get(workflowId);
        if (!workflow) {
          this.jsonResponseWriter.write(response, 404, { error: "Unknown workflowId" });
          return;
        }
        this.jsonResponseWriter.write(response, 200, this.workflowDtoMapper.toDetail(workflow));
        return;
      }

      const runId = this.pathMatcher.getRunId(pathname);
      if (request.method === "GET" && runId) {
        const state = await this.args.runtime.runStore.load(runId);
        if (!state) {
          this.jsonResponseWriter.write(response, 404, { error: "Unknown runId" });
          return;
        }
        this.jsonResponseWriter.write(response, 200, state);
        return;
      }

      const webhookEndpointId = this.pathMatcher.getWebhookEndpointId(pathname);
      if (request.method === "POST" && webhookEndpointId) {
        const entry = this.webhookRegistry.get(webhookEndpointId);
        if (!entry) {
          this.jsonResponseWriter.write(response, 404, { error: "Unknown webhook endpoint" });
          return;
        }
        if (String(entry.method).toUpperCase() !== "POST") {
          this.jsonResponseWriter.write(response, 405, { error: "Method not allowed" });
          return;
        }
        const body = await this.bodyReader.readJson(request);
        const items = await entry.handler(body);
        this.jsonResponseWriter.write(response, 200, { ok: true, items });
        return;
      }

      if (request.method === "POST" && pathname === "/api/run") {
        const body = (await this.bodyReader.readJson(request)) as Readonly<{ workflowId?: string; items?: Items; startAt?: string }>;
        if (!body.workflowId) {
          this.jsonResponseWriter.write(response, 400, { error: "Missing workflowId" });
          return;
        }
        const workflow = this.workflowsById.get(body.workflowId);
        if (!workflow) {
          this.jsonResponseWriter.write(response, 404, { error: "Unknown workflowId" });
          return;
        }
        const startAt = body.startAt ?? workflow.nodes.find((node) => node.kind === "trigger")?.id ?? workflow.nodes[0]!.id;
        const items = body.items ?? [{ json: {} }];
        const result = await this.engine.runWorkflow(workflow, startAt as NodeId, items, undefined as ParentExecutionRef | undefined);
        this.jsonResponseWriter.write(response, 200, result);
        return;
      }

      this.jsonResponseWriter.write(response, 404, { error: "Not found" });
    } catch (error) {
      const exception = error instanceof Error ? error : new Error(String(error));
      this.args.logger.error("failed to handle codemation host request", exception);
      this.jsonResponseWriter.write(response, 500, { error: exception.message });
    }
  }

  private handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const pathname = this.pathMatcher.getPathname(request);
    if (pathname !== "/api/workflows/ws") {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    this.websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      this.totalConnectionsAccepted += 1;
      this.activeConnections += 1;
      this.lastConnectionAt = new Date().toISOString();
      this.args.logger.info(`realtime websocket accepted connection #${this.totalConnectionsAccepted}`);
      websocket.on("close", () => {
        this.activeConnections = Math.max(0, this.activeConnections - 1);
      });
      this.realtimeHub.connect(websocket);
    });
  }
}
