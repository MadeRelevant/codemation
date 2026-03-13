export type CodemationEventBusKind = "memory" | "redis";
export type CodemationSchedulerKind = "local" | "bullmq";
export type CodemationDatabaseKind = "sqlite";

export interface CodemationDatabaseConfig {
  readonly kind?: CodemationDatabaseKind;
  readonly path?: string;
  readonly url?: string;
}

export interface CodemationEventBusConfig {
  readonly kind?: CodemationEventBusKind;
  readonly redisUrl?: string;
  readonly queuePrefix?: string;
}

export interface CodemationSchedulerConfig {
  readonly kind?: CodemationSchedulerKind;
  readonly queuePrefix?: string;
  readonly workerQueues?: ReadonlyArray<string>;
}

export interface CodemationApplicationRuntimeConfig {
  readonly frontendPort?: number;
  readonly database?: CodemationDatabaseConfig;
  readonly eventBus?: CodemationEventBusConfig;
  readonly scheduler?: CodemationSchedulerConfig;
}
