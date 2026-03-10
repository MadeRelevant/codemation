import type { RunEventBus, RunStateStore } from "@codemation/core";
import { InMemoryRunEventBus, InlineDrivingScheduler, PublishingRunStateStore } from "@codemation/core";
import { RedisRunEventBus } from "@codemation/eventbus-redis";
import { BullmqScheduler } from "@codemation/queue-bullmq";
import { SqliteRunStateStore } from "@codemation/run-store-sqlite";

export type RealtimeRuntimeMode = "memory" | "redis";

export interface RealtimeRuntimeDiagnostics {
  readonly dbPath: string;
  readonly mode: RealtimeRuntimeMode;
  readonly eventBusKind: "memory" | "redis";
  readonly schedulerKind: "inline" | "bullmq";
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

export class RealtimeRuntimeFactory {
  static create(args: Readonly<{ dbPath: string; redisUrl?: string; queuePrefix?: string; mode?: RealtimeRuntimeMode }>): RealtimeRuntime {
    const diagnostics = this.describe(args);
    const mode = diagnostics.mode;
    if (mode === "redis") {
      const redisUrl = this.requireRedisUrl(args.redisUrl);
      const queuePrefix = diagnostics.queuePrefix ?? "codemation";
      const eventBus = new RedisRunEventBus(redisUrl, queuePrefix);
      return {
        mode,
        eventBus,
        runStore: new PublishingRunStateStore(new SqliteRunStateStore(args.dbPath), eventBus),
        scheduler: new BullmqScheduler({ url: redisUrl }, queuePrefix),
        diagnostics,
      };
    }

    const eventBus = new InMemoryRunEventBus();
    return {
      mode,
      eventBus,
      runStore: new PublishingRunStateStore(new SqliteRunStateStore(args.dbPath), eventBus),
      activationScheduler: new InlineDrivingScheduler(),
      diagnostics,
    };
  }

  static describe(args: Readonly<{ dbPath: string; redisUrl?: string; queuePrefix?: string; mode?: RealtimeRuntimeMode }>): RealtimeRuntimeDiagnostics {
    const mode = this.resolveMode(args.mode, args.redisUrl);
    if (mode === "redis") {
      return {
        dbPath: args.dbPath,
        mode,
        eventBusKind: "redis",
        schedulerKind: "bullmq",
        redisUrl: this.requireRedisUrl(args.redisUrl),
        queuePrefix: args.queuePrefix ?? "codemation",
      };
    }

    return {
      dbPath: args.dbPath,
      mode,
      eventBusKind: "memory",
      schedulerKind: "inline",
    };
  }

  private static resolveMode(mode: RealtimeRuntimeMode | undefined, redisUrl: string | undefined): RealtimeRuntimeMode {
    if (mode) return mode;
    return redisUrl ? "redis" : "memory";
  }

  private static requireRedisUrl(redisUrl: string | undefined): string {
    if (!redisUrl) throw new Error("Realtime runtime mode 'redis' requires REDIS_URL");
    return redisUrl;
  }
}
