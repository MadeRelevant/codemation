import type { Container, RunEventBus, RunStateStore } from "@codemation/core";
import { ConfigDrivenOffloadPolicy, CoreTokens, DefaultDrivingScheduler, DefaultExecutionContextFactory, InMemoryRunDataFactory, InMemoryRunEventBus, InlineDrivingScheduler, PublishingRunStateStore, injectable } from "@codemation/core";
import { RedisRunEventBus } from "@codemation/eventbus-redis";
import { BullmqScheduler } from "@codemation/queue-bullmq";
import { SqliteRunStateStore } from "@codemation/run-store-sqlite";
import path from "node:path";
import { ApplicationTokens } from "./applicationTokens";
import type { CodemationApplicationRuntimeConfig, CodemationEventBusKind, CodemationSchedulerKind } from "./runtime/codemationRuntimeConfig";

export type RealtimeRuntimeMode = "memory" | "redis";

export interface RealtimeRuntimeDiagnostics {
  readonly dbPath: string;
  readonly mode: RealtimeRuntimeMode;
  readonly eventBusKind: CodemationEventBusKind;
  readonly schedulerKind: CodemationSchedulerKind;
  readonly redisUrl?: string;
  readonly queuePrefix?: string;
}

export interface RealtimeRuntime {
  mode: RealtimeRuntimeMode;
  eventBus: RunEventBus;
  runStore: RunStateStore;
  activationScheduler?: InlineDrivingScheduler;
  scheduler?: BullmqScheduler;
  diagnostics: RealtimeRuntimeDiagnostics;
}

@injectable()
export class RealtimeRuntimeFactory {
  register(args: Readonly<{ container: Container; repoRoot: string; runtimeConfig: CodemationApplicationRuntimeConfig; env?: Readonly<NodeJS.ProcessEnv> }>): RealtimeRuntimeDiagnostics {
    const runtime = this.create({
      repoRoot: args.repoRoot,
      runtimeConfig: args.runtimeConfig,
      env: args.env,
    });
    args.container.registerInstance(CoreTokens.RunEventBus, runtime.eventBus);
    args.container.registerInstance(CoreTokens.RunStateStore, runtime.runStore);
    args.container.registerInstance(CoreTokens.NodeActivationScheduler, this.resolveActivationScheduler(runtime));
    args.container.registerInstance(ApplicationTokens.RealtimeRuntimeDiagnostics, runtime.diagnostics);
    args.container.registerInstance(CoreTokens.RunDataFactory, new InMemoryRunDataFactory());
    args.container.registerInstance(CoreTokens.ExecutionContextFactory, new DefaultExecutionContextFactory());
    if (runtime.scheduler) {
      args.container.registerInstance(BullmqScheduler, runtime.scheduler);
    }
    return runtime.diagnostics;
  }

  create(args: Readonly<{ repoRoot: string; runtimeConfig: CodemationApplicationRuntimeConfig; env?: Readonly<NodeJS.ProcessEnv> }>): RealtimeRuntime {
    const resolved = this.resolve(args);
    const eventBus = this.createEventBus(resolved);
    const runStore = new PublishingRunStateStore(new SqliteRunStateStore(resolved.dbPath), eventBus);
    if (resolved.schedulerKind === "bullmq") {
      const redisUrl = this.requireRedisUrl(resolved.redisUrl);
      return {
        mode: resolved.mode,
        eventBus,
        runStore,
        scheduler: new BullmqScheduler({ url: redisUrl }, resolved.queuePrefix),
        diagnostics: this.toDiagnostics(resolved),
      };
    }
    return {
      mode: resolved.mode,
      eventBus,
      runStore,
      activationScheduler: new InlineDrivingScheduler(),
      diagnostics: this.toDiagnostics(resolved),
    };
  }

  describe(args: Readonly<{ repoRoot: string; runtimeConfig: CodemationApplicationRuntimeConfig; env?: Readonly<NodeJS.ProcessEnv> }>): RealtimeRuntimeDiagnostics {
    return this.toDiagnostics(this.resolve(args));
  }

  resolveMode(args: Readonly<{ runtimeConfig: CodemationApplicationRuntimeConfig; env?: Readonly<NodeJS.ProcessEnv> }>): RealtimeRuntimeMode {
    return this.resolve({
      repoRoot: process.cwd(),
      runtimeConfig: args.runtimeConfig,
      env: args.env,
    }).mode;
  }

  private createEventBus(resolved: ResolvedRealtimeRuntime): RunEventBus {
    if (resolved.eventBusKind === "redis") return new RedisRunEventBus(this.requireRedisUrl(resolved.redisUrl), resolved.queuePrefix);
    return new InMemoryRunEventBus();
  }

  private toDiagnostics(resolved: ResolvedRealtimeRuntime): RealtimeRuntimeDiagnostics {
    return {
      dbPath: resolved.dbPath,
      mode: resolved.mode,
      eventBusKind: resolved.eventBusKind,
      schedulerKind: resolved.schedulerKind,
      redisUrl: resolved.redisUrl,
      queuePrefix: resolved.queuePrefix,
    };
  }

  private resolve(args: Readonly<{ repoRoot: string; runtimeConfig: CodemationApplicationRuntimeConfig; env?: Readonly<NodeJS.ProcessEnv> }>): ResolvedRealtimeRuntime {
    const effectiveEnv = { ...process.env, ...(args.env ?? {}) };
    const dbPath = this.resolveDatabasePath(args.repoRoot, args.runtimeConfig, effectiveEnv);
    const redisUrl = args.runtimeConfig.eventBus?.redisUrl ?? effectiveEnv.REDIS_URL;
    const schedulerKind = this.resolveSchedulerKind(args.runtimeConfig, effectiveEnv, redisUrl);
    const eventBusKind = this.resolveEventBusKind(args.runtimeConfig, effectiveEnv, schedulerKind, redisUrl);
    const queuePrefix = args.runtimeConfig.scheduler?.queuePrefix ?? args.runtimeConfig.eventBus?.queuePrefix ?? effectiveEnv.QUEUE_PREFIX ?? "codemation";
    if (schedulerKind === "bullmq" && eventBusKind !== "redis") {
      throw new Error("BullMQ scheduling requires a Redis event bus so worker events can be forwarded to connected clients.");
    }
    if (eventBusKind === "redis" && !redisUrl) {
      throw new Error("Redis event bus requires runtime.eventBus.redisUrl or REDIS_URL.");
    }
    return {
      dbPath,
      mode: eventBusKind === "redis" || schedulerKind === "bullmq" ? "redis" : "memory",
      eventBusKind,
      schedulerKind,
      redisUrl,
      queuePrefix,
    };
  }

  private resolveSchedulerKind(
    runtimeConfig: CodemationApplicationRuntimeConfig,
    env: Readonly<NodeJS.ProcessEnv>,
    redisUrl: string | undefined,
  ): CodemationSchedulerKind {
    const configuredKind = runtimeConfig.scheduler?.kind ?? this.readSchedulerKind(env.CODEMATION_SCHEDULER);
    if (configuredKind) return configuredKind;
    return redisUrl ? "bullmq" : "local";
  }

  private resolveEventBusKind(
    runtimeConfig: CodemationApplicationRuntimeConfig,
    env: Readonly<NodeJS.ProcessEnv>,
    schedulerKind: CodemationSchedulerKind,
    redisUrl: string | undefined,
  ): CodemationEventBusKind {
    const configuredKind = runtimeConfig.eventBus?.kind ?? this.readEventBusKind(env.CODEMATION_EVENT_BUS);
    if (configuredKind) return configuredKind;
    if (schedulerKind === "bullmq") return "redis";
    return redisUrl ? "redis" : "memory";
  }

  private resolveDatabasePath(
    repoRoot: string,
    runtimeConfig: CodemationApplicationRuntimeConfig,
    env: Readonly<NodeJS.ProcessEnv>,
  ): string {
    const configuredPath = runtimeConfig.database?.path;
    if (configuredPath) return this.normalizePath(repoRoot, configuredPath);
    const configuredUrl = runtimeConfig.database?.url ?? env.DATABASE_URL;
    if (configuredUrl) return this.resolveDatabasePathFromUrl(repoRoot, configuredUrl);
    const envDbPath = env.CODEMATION_DB_PATH;
    if (envDbPath) return this.normalizePath(repoRoot, envDbPath);
    return path.join(repoRoot, ".codemation", "runs.sqlite");
  }

  private resolveDatabasePathFromUrl(repoRoot: string, databaseUrl: string): string {
    if (databaseUrl.startsWith("file://")) return new URL(databaseUrl).pathname;
    if (databaseUrl.startsWith("file:")) return this.normalizePath(repoRoot, databaseUrl.slice("file:".length));
    if (databaseUrl.startsWith("sqlite://")) return this.normalizePath(repoRoot, databaseUrl.slice("sqlite://".length));
    if (databaseUrl.startsWith("sqlite:")) return this.normalizePath(repoRoot, databaseUrl.slice("sqlite:".length));
    throw new Error(`Unsupported DATABASE_URL protocol for runtime database selection: ${databaseUrl}`);
  }

  private normalizePath(repoRoot: string, filePath: string): string {
    return path.isAbsolute(filePath) ? filePath : path.resolve(repoRoot, filePath);
  }

  private readSchedulerKind(value: string | undefined): CodemationSchedulerKind | undefined {
    if (value === "local" || value === "bullmq") return value;
    return undefined;
  }

  private readEventBusKind(value: string | undefined): CodemationEventBusKind | undefined {
    if (value === "memory" || value === "redis") return value;
    return undefined;
  }

  private requireRedisUrl(redisUrl: string | undefined): string {
    if (!redisUrl) throw new Error("Redis-backed runtime requires runtime.eventBus.redisUrl or REDIS_URL.");
    return redisUrl;
  }

  private resolveActivationScheduler(runtime: RealtimeRuntime) {
    if (runtime.activationScheduler) return runtime.activationScheduler;
    if (!runtime.scheduler) throw new Error("BullMQ runtime requires a scheduler.");
    return new DefaultDrivingScheduler(new ConfigDrivenOffloadPolicy(), runtime.scheduler, new InlineDrivingScheduler());
  }
}

type ResolvedRealtimeRuntime = Readonly<{
  dbPath: string;
  mode: RealtimeRuntimeMode;
  eventBusKind: CodemationEventBusKind;
  schedulerKind: CodemationSchedulerKind;
  redisUrl?: string;
  queuePrefix: string;
}>;
