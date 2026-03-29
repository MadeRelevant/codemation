import { BullmqScheduler } from "@codemation/queue-bullmq";
import type { WorkerRuntimeScheduler } from "../../infrastructure/runtime/WorkerRuntimeScheduler";
import type { ResolvedDatabasePersistence } from "../../infrastructure/persistence/DatabasePersistenceResolver";
import { DatabasePersistenceResolver } from "../../infrastructure/persistence/DatabasePersistenceResolver";
import { SchedulerPersistenceCompatibilityValidator } from "../../infrastructure/persistence/SchedulerPersistenceCompatibilityValidator";
import type {
  CodemationApplicationRuntimeConfig,
  CodemationEventBusKind,
  CodemationSchedulerKind,
} from "../../presentation/config/CodemationConfig";

export type ResolvedImplementationSelection = Readonly<{
  databasePersistence: ResolvedDatabasePersistence;
  eventBusKind: CodemationEventBusKind;
  queuePrefix: string;
  redisUrl?: string;
  schedulerKind: CodemationSchedulerKind;
  workerRuntimeScheduler?: WorkerRuntimeScheduler;
}>;

export class ResolvedImplementationSelectionFactory {
  constructor(
    private readonly databasePersistenceResolver: DatabasePersistenceResolver = new DatabasePersistenceResolver(),
    private readonly schedulerPersistenceCompatibilityValidator: SchedulerPersistenceCompatibilityValidator = new SchedulerPersistenceCompatibilityValidator(),
  ) {}

  resolve(
    args: Readonly<{
      consumerRoot: string;
      runtimeConfig: CodemationApplicationRuntimeConfig;
      env: Readonly<NodeJS.ProcessEnv>;
    }>,
  ): ResolvedImplementationSelection {
    const databasePersistence = this.databasePersistenceResolver.resolve({
      runtimeConfig: args.runtimeConfig,
      env: args.env,
      consumerRoot: args.consumerRoot,
    });
    const redisUrl = args.runtimeConfig.eventBus?.redisUrl ?? args.env.REDIS_URL;
    const schedulerKind = this.resolveSchedulerKind(args.runtimeConfig, args.env, redisUrl);
    const eventBusKind = this.resolveEventBusKind(args.runtimeConfig, args.env, schedulerKind, redisUrl);
    const queuePrefix =
      args.runtimeConfig.scheduler?.queuePrefix ??
      args.runtimeConfig.eventBus?.queuePrefix ??
      args.env.QUEUE_PREFIX ??
      "codemation";
    if (schedulerKind === "bullmq" && eventBusKind !== "redis") {
      throw new Error(
        "BullMQ scheduling requires a Redis event bus so worker events can be forwarded to connected clients.",
      );
    }
    if (eventBusKind === "redis" && !redisUrl) {
      throw new Error("Redis event bus requires runtime.eventBus.redisUrl or REDIS_URL.");
    }
    this.schedulerPersistenceCompatibilityValidator.validate({ schedulerKind, persistence: databasePersistence });
    const workerRuntimeScheduler =
      schedulerKind === "bullmq"
        ? new BullmqScheduler({ url: this.requireRedisUrl(redisUrl) }, queuePrefix)
        : undefined;
    return {
      databasePersistence,
      eventBusKind,
      queuePrefix,
      redisUrl,
      schedulerKind,
      workerRuntimeScheduler,
    };
  }

  private resolveSchedulerKind(
    runtimeConfig: CodemationApplicationRuntimeConfig,
    env: Readonly<NodeJS.ProcessEnv>,
    redisUrl: string | undefined,
  ): CodemationSchedulerKind {
    const configuredKind = runtimeConfig.scheduler?.kind ?? this.readSchedulerKind(env.CODEMATION_SCHEDULER);
    if (configuredKind) {
      return configuredKind;
    }
    return redisUrl ? "bullmq" : "local";
  }

  private resolveEventBusKind(
    runtimeConfig: CodemationApplicationRuntimeConfig,
    env: Readonly<NodeJS.ProcessEnv>,
    schedulerKind: CodemationSchedulerKind,
    redisUrl: string | undefined,
  ): CodemationEventBusKind {
    const configuredKind = runtimeConfig.eventBus?.kind ?? this.readEventBusKind(env.CODEMATION_EVENT_BUS);
    if (configuredKind) {
      return configuredKind;
    }
    if (schedulerKind === "bullmq") {
      return "redis";
    }
    return redisUrl ? "redis" : "memory";
  }

  private readSchedulerKind(value: string | undefined): CodemationSchedulerKind | undefined {
    if (value === "local" || value === "bullmq") {
      return value;
    }
    return undefined;
  }

  private readEventBusKind(value: string | undefined): CodemationEventBusKind | undefined {
    if (value === "memory" || value === "redis") {
      return value;
    }
    return undefined;
  }

  private requireRedisUrl(redisUrl: string | undefined): string {
    if (!redisUrl) {
      throw new Error("Redis-backed runtime requires runtime.eventBus.redisUrl or REDIS_URL.");
    }
    return redisUrl;
  }
}
