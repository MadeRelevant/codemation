import "reflect-metadata";

import type { Container, CredentialService, EngineHost, RunStateStore, WorkflowDefinition } from "@codemation/core";
import { Engine, EngineWorkflowRunnerService, PublishingRunStateStore, SimpleContainerFactory } from "@codemation/core";
import type { RunEventBus } from "@codemation/core";
import { RedisRunEventBus } from "@codemation/eventbus-redis";
import { BullmqScheduler } from "@codemation/queue-bullmq";
import { SqliteRunStateStore } from "@codemation/run-store-sqlite";
import { mkdir } from "node:fs/promises";
import net from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

type StopHandle = Readonly<{ stop: () => Promise<void> }>;

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

class ManagedChildProcess {
  constructor(private readonly proc: ChildProcess) {}

  async stop(): Promise<void> {
    if (!this.proc.pid) return;
    if (this.proc.exitCode !== null) return;
    this.proc.kill("SIGINT");
    await new Promise<void>((resolve) => this.proc.once("exit", () => resolve()));
  }
}

export class CodemationApplication {
  private container: Container = SimpleContainerFactory.create();
  private workflows: WorkflowDefinition[] = [];
  private credentials: CredentialService | undefined;

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

  async startFrontendMode(args: Readonly<{ repoRoot: string; env?: Record<string, string> }>): Promise<StopHandle> {
    const defaultDbPath = path.join(args.repoRoot, ".codemation", "runs.sqlite");
    await mkdir(path.dirname(defaultDbPath), { recursive: true });

    const preferredPort = Number(process.env.CODEMATION_FRONTEND_PORT ?? 3000);
    const port = await pickAvailablePort(preferredPort);

    const proc = spawn("pnpm", ["-C", "apps/frontend", "dev"], {
      cwd: args.repoRoot,
      stdio: "inherit",
      env: { ...process.env, PORT: String(port), CODEMATION_DB_PATH: defaultDbPath, ...(args.env ?? {}) },
    });
    const handle = new ManagedChildProcess(proc);
    return { stop: async () => await handle.stop() };
  }

  async startWorkerMode(args: Readonly<{ redisUrl: string; queuePrefix?: string; queues: ReadonlyArray<string>; dbPath: string }>): Promise<StopHandle> {
    const credentials = this.credentials;
    if (!credentials) throw new Error("CodemationApplication is missing credentials (call useCredentials)");

    const queuePrefix = args.queuePrefix ?? "codemation";
    const eventBus: RunEventBus = new RedisRunEventBus(args.redisUrl, queuePrefix);
    const runStore: RunStateStore = new PublishingRunStateStore(new SqliteRunStateStore(args.dbPath), eventBus);
    const scheduler = new BullmqScheduler({ url: args.redisUrl }, queuePrefix);

    const workflowsById = new Map(this.workflows.map((w) => [w.id, w] as const));
    const host = new WorkerHost(credentials);
    const engine = new Engine(this.container, host as any, IdFactory.makeRunId as any, IdFactory.makeActivationId as any, "/webhooks", runStore, undefined, scheduler);
    host.workflows = new EngineWorkflowRunnerService(engine, workflowsById) as any;

    engine.loadWorkflows(this.workflows);

    const worker = scheduler.createWorker({
      queues: args.queues,
      workflowsById,
      container: this.container,
      credentials,
      runStore,
      continuation: engine,
      workflows: host.workflows,
    });

    return {
      stop: async () => {
        await worker.stop();
        await scheduler.close();
      },
    };
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

