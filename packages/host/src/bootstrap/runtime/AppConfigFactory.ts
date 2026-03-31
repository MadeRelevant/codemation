import { CoreTokens } from "@codemation/core";
import type { AppConfig } from "../../presentation/config/AppConfig";
import type { NormalizedCodemationConfig } from "../../presentation/config/CodemationConfigNormalizer";
import type {
  CodemationApplicationRuntimeConfig,
  CodemationDatabaseKind,
  CodemationEventBusKind,
  CodemationSchedulerKind,
} from "../../presentation/config/CodemationConfig";
import path from "node:path";

export class AppConfigFactory {
  create(
    args: Readonly<{
      repoRoot: string;
      consumerRoot: string;
      env: NodeJS.ProcessEnv;
      config: NormalizedCodemationConfig;
      workflowSources: ReadonlyArray<string>;
    }>,
  ): AppConfig {
    const runtimeConfig = args.config.runtime ?? {};
    const persistence = this.resolvePersistence(runtimeConfig, args.env, args.consumerRoot);
    const redisUrl = runtimeConfig.eventBus?.redisUrl ?? args.env.REDIS_URL;
    const schedulerKind = this.resolveSchedulerKind(runtimeConfig, args.env, redisUrl);
    const eventBusKind = this.resolveEventBusKind(runtimeConfig, args.env, schedulerKind, redisUrl);
    const workerQueues = runtimeConfig.scheduler?.workerQueues ?? [];
    const queuePrefix =
      runtimeConfig.scheduler?.queuePrefix ?? runtimeConfig.eventBus?.queuePrefix ?? args.env.QUEUE_PREFIX;
    const hasConfiguredCredentialSessionServiceRegistration = args.config.containerRegistrations.some(
      (entry) => entry.token === CoreTokens.CredentialSessionService,
    );

    return {
      consumerRoot: args.consumerRoot,
      repoRoot: args.repoRoot,
      env: args.env,
      workflowSources: [...args.workflowSources],
      workflows: [...(args.config.workflows ?? [])],
      containerRegistrations: [...args.config.containerRegistrations],
      credentialTypes: [...(args.config.credentialTypes ?? [])],
      plugins: [...(args.config.plugins ?? [])],
      hasConfiguredCredentialSessionServiceRegistration,
      log: args.config.log,
      engineExecutionLimits: runtimeConfig.engineExecutionLimits,
      databaseUrl:
        persistence.kind === "postgresql" ? persistence.databaseUrl : runtimeConfig.database?.url?.trim() || undefined,
      database: runtimeConfig.database,
      persistence,
      scheduler: {
        kind: schedulerKind,
        queuePrefix,
        workerQueues,
        redisUrl,
      },
      eventing: {
        kind: eventBusKind,
        queuePrefix,
        redisUrl,
      },
      auth: args.config.auth,
      whitelabel: args.config.whitelabel ?? {},
      webSocketPort: this.resolveWebSocketPort(args.env),
      webSocketBindHost: args.env.CODEMATION_WS_BIND_HOST ?? "0.0.0.0",
    };
  }

  private resolvePersistence(
    runtimeConfig: CodemationApplicationRuntimeConfig,
    env: NodeJS.ProcessEnv,
    consumerRoot: string,
  ): AppConfig["persistence"] {
    const database = runtimeConfig.database;
    if (!database) {
      return { kind: "none" };
    }
    const kind = this.resolveDatabaseKind(database.kind, database.url, env);
    if (kind === "postgresql") {
      const databaseUrl = database.url?.trim() ?? "";
      if (!databaseUrl) {
        throw new Error('runtime.database.kind is "postgresql" but no database URL was set (runtime.database.url).');
      }
      if (!databaseUrl.startsWith("postgresql://") && !databaseUrl.startsWith("postgres://")) {
        throw new Error(
          `runtime.database.url must be a postgresql:// or postgres:// URL when kind is postgresql. Received: ${databaseUrl}`,
        );
      }
      return { kind: "postgresql", databaseUrl };
    }
    return {
      kind: "pglite",
      dataDir: this.resolvePgliteDataDir(database.pgliteDataDir, env, consumerRoot),
    };
  }

  private resolveDatabaseKind(
    configuredKind: CodemationDatabaseKind | undefined,
    databaseUrl: string | undefined,
    env: NodeJS.ProcessEnv,
  ): CodemationDatabaseKind {
    const kindFromEnv = env.CODEMATION_DATABASE_KIND?.trim();
    if (kindFromEnv === "postgresql" || kindFromEnv === "pglite") {
      return kindFromEnv;
    }
    if (configuredKind) {
      return configuredKind;
    }
    const trimmedUrl = databaseUrl?.trim();
    if (trimmedUrl && (trimmedUrl.startsWith("postgresql://") || trimmedUrl.startsWith("postgres://"))) {
      return "postgresql";
    }
    return "pglite";
  }

  private resolvePgliteDataDir(
    configuredPath: string | undefined,
    env: NodeJS.ProcessEnv,
    consumerRoot: string,
  ): string {
    const envPath = env.CODEMATION_PGLITE_DATA_DIR?.trim();
    if (envPath && envPath.length > 0) {
      return path.isAbsolute(envPath) ? envPath : path.resolve(consumerRoot, envPath);
    }
    const trimmedConfiguredPath = configuredPath?.trim();
    if (trimmedConfiguredPath && trimmedConfiguredPath.length > 0) {
      return path.isAbsolute(trimmedConfiguredPath)
        ? trimmedConfiguredPath
        : path.resolve(consumerRoot, trimmedConfiguredPath);
    }
    return path.resolve(consumerRoot, ".codemation", "pglite");
  }

  private resolveSchedulerKind(
    runtimeConfig: CodemationApplicationRuntimeConfig,
    env: NodeJS.ProcessEnv,
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
    env: NodeJS.ProcessEnv,
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

  private resolveWebSocketPort(env: NodeJS.ProcessEnv): number {
    const configuredPort = Number(env.CODEMATION_WS_PORT ?? 3001);
    if (Number.isNaN(configuredPort) || configuredPort <= 0) {
      return 3001;
    }
    return configuredPort;
  }
}
