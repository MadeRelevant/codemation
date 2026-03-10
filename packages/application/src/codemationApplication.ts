import "reflect-metadata";

import type { Container, CredentialService, EngineHost, WorkflowDefinition } from "@codemation/core";
import { Engine, EngineWorkflowRunnerService, InMemoryCredentialService, SimpleContainerFactory } from "@codemation/core";
import { mkdir } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { CodemationBootstrapDiscovery } from "./bootstrapDiscovery";
import type { CodemationFrontendHostServerDiagnostics } from "./codemationFrontendHostServer";
import { CodemationFrontendHostServer } from "./codemationFrontendHostServer";
import { RealtimeRuntimeFactory } from "./realtimeRuntimeFactory";
import { CodemationStartupSummaryReporter, ConsoleStartupSummaryLogger } from "./startupSummary";

type StopHandle = Readonly<{ stop: () => Promise<void> }>;

export type CodemationStopHandle = StopHandle;

export interface CodemationApplicationConfig {
  readonly container?: Container;
  readonly workflows: ReadonlyArray<WorkflowDefinition>;
  readonly credentials: CredentialService;
  readonly runtime?: CodemationApplicationRuntimeConfig;
}

export interface CodemationApplicationRuntimeConfig {
  readonly frontendPort?: number;
  readonly serverPort?: number;
  readonly realtimeMode?: "memory" | "redis";
  readonly redisUrl?: string;
  readonly queuePrefix?: string;
  readonly dbPath?: string;
  readonly websocketBindHost?: string;
  readonly workerQueues?: ReadonlyArray<string>;
}

type FrontendStartArgs = Readonly<{
  repoRoot: string;
  env?: Record<string, string>;
  bootstrapSource?: string | null;
  workflowSources?: ReadonlyArray<string>;
}>;

export interface CodemationFrontendHostHandle extends StopHandle {
  readonly frontendPort: number;
  readonly serverPort: number;
  readonly serverUrl: string;
  readonly websocketUrl: string;
  readonly runtimeMode: "memory" | "redis";
  readonly dbPath: string;
  readonly diagnostics: CodemationFrontendHostServerDiagnostics;
}

class IdFactory {
  static makeRunId(): string {
    return `run_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
  static makeActivationId(): string {
    return `act_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

class WorkerHost implements EngineHost {
  workflows: any;
  constructor(public readonly credentials: CredentialService) {}

  registerWebhook(): any {
    throw new Error("WorkerHost.registerWebhook is not supported in worker mode");
  }

  onNodeActivation(): void {}
}

class ConsoleCodemationHostLogger {
  constructor(private readonly scope: string) {}

  info(message: string, exception?: Error): void {
    this.log("info", message, exception);
  }

  warn(message: string, exception?: Error): void {
    this.log("warn", message, exception);
  }

  error(message: string, exception?: Error): void {
    this.log("error", message, exception);
  }

  debug(message: string, exception?: Error): void {
    this.log("debug", message, exception);
  }

  private log(level: "info" | "warn" | "error" | "debug", message: string, exception?: Error): void {
    const prefix = `[${this.scope}]`;
    if (exception) {
      console[level](`${prefix} ${message}`, exception);
      return;
    }
    console[level](`${prefix} ${message}`);
  }
}

export class CodemationApplication {
  private container: Container = SimpleContainerFactory.create();
  private workflows: WorkflowDefinition[] = [];
  private credentials: CredentialService = new InMemoryCredentialService();
  private runtimeConfig: CodemationApplicationRuntimeConfig = {};
  private readonly startupSummaryReporter = new CodemationStartupSummaryReporter(new ConsoleStartupSummaryLogger());

  useConfig(config: CodemationApplicationConfig): this {
    if (config.container) this.container = config.container;
    this.workflows = [...config.workflows];
    this.credentials = config.credentials;
    if (config.runtime) this.runtimeConfig = { ...config.runtime };
    return this;
  }

  useContainer(container: Container): this {
    this.container = container;
    return this;
  }

  useWorkflows(workflows: WorkflowDefinition[]): this {
    this.workflows = workflows;
    return this;
  }

  useCredentials(credentials: CredentialService): this {
    this.credentials = credentials;
    return this;
  }

  useRuntimeConfig(runtimeConfig: CodemationApplicationRuntimeConfig): this {
    this.runtimeConfig = { ...this.runtimeConfig, ...runtimeConfig };
    return this;
  }

  getRuntimeConfig(): CodemationApplicationRuntimeConfig {
    return { ...this.runtimeConfig };
  }

  resolveRealtimeModeForEnvironment(env?: Readonly<NodeJS.ProcessEnv>): "memory" | "redis" {
    return this.resolveRealtimeMode({ ...process.env, ...(env ?? {}) });
  }

  /**
   * @deprecated Start the framework UI shell via `@codemation/cli`.
   * This method now starts only the Codemation host runtime.
   */
  static async startDiscoveredFrontendMode(args: Readonly<{
    repoRoot: string;
    consumerRoot: string;
    env?: Record<string, string>;
    bootstrapPathOverride?: string;
    workflowsDirectoryOverride?: string;
  }>): Promise<CodemationFrontendHostHandle> {
    const discovery = new CodemationBootstrapDiscovery();
    const application = new CodemationApplication();
    const setup = await discovery.discover({
      application,
      repoRoot: args.repoRoot,
      consumerRoot: args.consumerRoot,
      env: args.env,
      bootstrapPathOverride: args.bootstrapPathOverride,
      workflowsDirectoryOverride: args.workflowsDirectoryOverride,
    });
    return await setup.application.startFrontendMode({
      repoRoot: args.repoRoot,
      env: args.env,
      bootstrapSource: setup.bootstrapSource,
      workflowSources: setup.workflowSources,
    });
  }

  static async startDiscoveredFrontendHostMode(args: Readonly<{
    repoRoot: string;
    consumerRoot: string;
    env?: Record<string, string>;
    bootstrapPathOverride?: string;
    workflowsDirectoryOverride?: string;
  }>): Promise<CodemationFrontendHostHandle> {
    const discovery = new CodemationBootstrapDiscovery();
    const application = new CodemationApplication();
    const setup = await discovery.discover({
      application,
      repoRoot: args.repoRoot,
      consumerRoot: args.consumerRoot,
      env: args.env,
      bootstrapPathOverride: args.bootstrapPathOverride,
      workflowsDirectoryOverride: args.workflowsDirectoryOverride,
    });
    return await setup.application.startFrontendHostMode({
      repoRoot: args.repoRoot,
      env: args.env,
      bootstrapSource: setup.bootstrapSource,
      workflowSources: setup.workflowSources,
    });
  }

  static async startDiscoveredWorkerMode(args: Readonly<{
    repoRoot: string;
    consumerRoot: string;
    env?: Record<string, string>;
    bootstrapPathOverride?: string;
    workflowsDirectoryOverride?: string;
  }>): Promise<StopHandle> {
    const discovery = new CodemationBootstrapDiscovery();
    const application = new CodemationApplication();
    const setup = await discovery.discover({
      application,
      repoRoot: args.repoRoot,
      consumerRoot: args.consumerRoot,
      env: args.env,
      bootstrapPathOverride: args.bootstrapPathOverride,
      workflowsDirectoryOverride: args.workflowsDirectoryOverride,
    });

    const effectiveEnv = { ...process.env, ...(args.env ?? {}) };
    const workerQueues = setup.application.runtimeConfig.workerQueues ?? CodemationApplication.parseQueues(effectiveEnv.WORKER_QUEUES ?? "default");
    const redisUrl = setup.application.runtimeConfig.redisUrl ?? effectiveEnv.REDIS_URL;
    if (!redisUrl) throw new Error("Worker mode requires REDIS_URL or a bootstrap runtime redisUrl");

    const dbPath = setup.application.runtimeConfig.dbPath ?? effectiveEnv.CODEMATION_DB_PATH ?? path.join(args.repoRoot, ".codemation", "runs.sqlite");
    return await setup.application.startWorkerMode({
      redisUrl,
      dbPath,
      queues: workerQueues,
      queuePrefix: setup.application.runtimeConfig.queuePrefix ?? effectiveEnv.QUEUE_PREFIX ?? "codemation",
      bootstrapSource: setup.bootstrapSource,
      workflowSources: setup.workflowSources,
    });
  }

  /**
   * @deprecated Start the framework UI shell via `@codemation/cli`.
   * This method now starts only the Codemation host runtime.
   */
  async startFrontendMode(args: FrontendStartArgs): Promise<CodemationFrontendHostHandle> {
    const startup = await this.startFrontendHost(args, true, "frontend runtime summary");
    return this.createFrontendHostHandle(startup);
  }

  async startFrontendHostMode(args: FrontendStartArgs): Promise<CodemationFrontendHostHandle> {
    const startup = await this.startFrontendHost(args, false, "frontend host summary");
    return this.createFrontendHostHandle(startup);
  }

  async startWorkerMode(args: Readonly<{
    redisUrl: string;
    queuePrefix?: string;
    queues: ReadonlyArray<string>;
    dbPath: string;
    bootstrapSource?: string | null;
    workflowSources?: ReadonlyArray<string>;
  }>): Promise<StopHandle> {
    const runtime = RealtimeRuntimeFactory.create({
      dbPath: args.dbPath,
      redisUrl: args.redisUrl,
      queuePrefix: args.queuePrefix,
      mode: "redis",
    });
    if (!runtime.scheduler || runtime.mode !== "redis") throw new Error("Worker mode requires a redis realtime runtime");
    const scheduler = runtime.scheduler;

    const workflowsById = new Map(this.workflows.map((w) => [w.id, w] as const));
    const host = new WorkerHost(this.credentials);
    const engine = new Engine(
      this.container,
      host as any,
      IdFactory.makeRunId as any,
      IdFactory.makeActivationId as any,
      "/webhooks",
      runtime.runStore,
      undefined,
      runtime.scheduler,
      undefined,
      undefined,
      undefined,
      runtime.eventBus,
    );
    host.workflows = new EngineWorkflowRunnerService(engine, workflowsById) as any;

    engine.loadWorkflows(this.workflows);

    const worker = scheduler.createWorker({
      queues: args.queues,
      workflowsById,
      container: this.container,
      credentials: this.credentials,
      runStore: runtime.runStore,
      continuation: engine,
      workflows: host.workflows,
    });

    this.startupSummaryReporter.reportWorker({
      processLabel: "worker startup summary",
      runtime: runtime.diagnostics,
      workflowDefinitions: this.workflows,
      queues: args.queues,
      bootstrapSource: args.bootstrapSource ?? null,
      workflowSources: args.workflowSources ?? [],
    });

    return {
      stop: async () => {
        await worker.stop();
        await scheduler.close();
      },
    };
  }

  private static parseQueues(rawQueues: string): ReadonlyArray<string> {
    return rawQueues
      .split(",")
      .map((queue) => queue.trim())
      .filter(Boolean);
  }

  private async startFrontendHost(
    args: FrontendStartArgs,
    allowPortFallback: boolean,
    processLabel: string,
  ): Promise<
    Readonly<{
      hostServer: CodemationFrontendHostServer;
      effectiveEnv: NodeJS.ProcessEnv;
      dbPath: string;
      frontendPort: number;
      serverPort: number;
      runtimeMode: "memory" | "redis";
    }>
  > {
    const dbPath = this.runtimeConfig.dbPath ?? path.join(args.repoRoot, ".codemation", "runs.sqlite");
    await mkdir(path.dirname(dbPath), { recursive: true });
    const effectiveEnv = { ...process.env, ...(args.env ?? {}) };
    const preferredFrontendPort = Number(this.runtimeConfig.frontendPort ?? effectiveEnv.CODEMATION_FRONTEND_PORT ?? 3000);
    const frontendPort = allowPortFallback ? await pickAvailablePort(preferredFrontendPort) : preferredFrontendPort;
    const preferredServerPort = Number(this.runtimeConfig.serverPort ?? effectiveEnv.CODEMATION_SERVER_PORT ?? effectiveEnv.CODEMATION_WS_PORT ?? frontendPort + 1);
    const serverPort = allowPortFallback ? await pickAvailablePort(preferredServerPort) : await waitForPortToBeFree(preferredServerPort, 5000);
    const runtimeMode = this.resolveRealtimeMode(effectiveEnv);
    const queuePrefix = this.runtimeConfig.queuePrefix ?? effectiveEnv.QUEUE_PREFIX ?? "codemation";
    const redisUrl = this.runtimeConfig.redisUrl ?? effectiveEnv.REDIS_URL;
    const runtime = RealtimeRuntimeFactory.create({
      dbPath,
      redisUrl,
      queuePrefix,
      mode: runtimeMode,
    });
    const websocketHost = this.runtimeConfig.websocketBindHost ?? effectiveEnv.CODEMATION_WS_BIND_HOST ?? "0.0.0.0";
    const hostServer = new CodemationFrontendHostServer({
      container: this.container,
      credentials: this.credentials,
      workflows: this.workflows,
      runtime,
      port: serverPort,
      bindHost: websocketHost,
      logger: new ConsoleCodemationHostLogger("codemation-host"),
    });
    await hostServer.start();

    this.startupSummaryReporter.reportFrontend({
      processLabel,
      runtime: runtime.diagnostics,
      websocketHost,
      websocketPort: serverPort,
      workflowDefinitions: this.workflows,
      triggerStatusLabel: "started in codemation host",
      bootstrapSource: args.bootstrapSource ?? null,
      workflowSources: args.workflowSources ?? [],
    });

    return {
      hostServer,
      effectiveEnv,
      dbPath,
      frontendPort,
      serverPort,
      runtimeMode,
    };
  }

  private createFrontendHostHandle(
    startup: Readonly<{
      hostServer: CodemationFrontendHostServer;
      effectiveEnv: NodeJS.ProcessEnv;
      dbPath: string;
      frontendPort: number;
      serverPort: number;
      runtimeMode: "memory" | "redis";
    }>,
  ): CodemationFrontendHostHandle {
    return {
      frontendPort: startup.frontendPort,
      serverPort: startup.serverPort,
      serverUrl: startup.hostServer.getApiBaseUrl(),
      websocketUrl: startup.hostServer.getWebSocketUrl(),
      runtimeMode: startup.runtimeMode,
      dbPath: startup.dbPath,
      diagnostics: startup.hostServer.getDiagnostics(),
      stop: async () => {
        await startup.hostServer.stop();
      },
    };
  }

  private resolveRealtimeMode(effectiveEnv: NodeJS.ProcessEnv): "memory" | "redis" {
    const configuredMode = this.runtimeConfig.realtimeMode ?? effectiveEnv.CODEMATION_REALTIME_MODE;
    if (configuredMode === "redis") return "redis";
    if (configuredMode === "memory") return "memory";
    return this.runtimeConfig.redisUrl ?? effectiveEnv.REDIS_URL ? "redis" : "memory";
  }
}

async function pickAvailablePort(preferredPort: number): Promise<number> {
  const base = Number.isFinite(preferredPort) && preferredPort > 0 ? Math.floor(preferredPort) : 3000;
  for (let port = base; port < base + 50; port++) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No available port found in range ${base}-${base + 49}`);
}

async function waitForPortToBeFree(port: number, timeoutMs: number): Promise<number> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortFree(port)) return port;
    // eslint-disable-next-line no-await-in-loop
    await sleep(100);
  }
  throw new Error(`Port ${port} did not become available within ${timeoutMs}ms`);
}

async function isPortFree(port: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const server = net
      .createServer()
      .once("error", () => resolve(false))
      .once("listening", () => server.close(() => resolve(true)))
      .listen({ port, host: "127.0.0.1" });
    server.unref();
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

