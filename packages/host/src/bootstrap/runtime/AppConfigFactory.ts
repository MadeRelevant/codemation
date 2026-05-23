import { CoreTokens } from "@codemation/core";
import type { AppConfig, AppPersistenceConfig, AppPluginLoadSummary } from "../../presentation/config/AppConfig";
import { CodemationPluginPackageMetadata } from "../../presentation/config/CodemationPlugin";
import type { NormalizedCodemationConfig } from "../../presentation/config/CodemationConfigNormalizer";
import type {
  CodemationApplicationRuntimeConfig,
  CodemationEventBusKind,
  CodemationSchedulerKind,
} from "../../presentation/config/CodemationConfig";
import { CodemationDatabaseUrlParser } from "../../infrastructure/persistence/CodemationDatabaseUrlParser";
import path from "node:path";

export class AppConfigFactory {
  private readonly pluginPackageMetadata = new CodemationPluginPackageMetadata();
  private readonly databaseUrlParser = new CodemationDatabaseUrlParser();

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
    const persistence = this.resolvePersistence(args.env, args.consumerRoot);
    const redisUrl = runtimeConfig.eventBus?.redisUrl ?? args.env.REDIS_URL;
    const schedulerKind = this.resolveSchedulerKind(runtimeConfig, args.env, redisUrl);
    const eventBusKind = this.resolveEventBusKind(runtimeConfig, args.env, schedulerKind, redisUrl);
    const workerQueues = runtimeConfig.scheduler?.workerQueues ?? [];
    const queuePrefix =
      runtimeConfig.scheduler?.queuePrefix ?? runtimeConfig.eventBus?.queuePrefix ?? args.env.QUEUE_PREFIX;
    const hasConfiguredCredentialSessionServiceRegistration = args.config.containerRegistrations.some(
      (entry) => entry.token === CoreTokens.CredentialSessionService,
    );
    const plugins = [...(args.config.plugins ?? [])];

    return {
      consumerRoot: args.consumerRoot,
      repoRoot: args.repoRoot,
      env: args.env,
      workflowSources: [...args.workflowSources],
      workflows: [...(args.config.workflows ?? [])],
      containerRegistrations: [...args.config.containerRegistrations],
      credentialTypes: [...(args.config.credentialTypes ?? [])],
      collections: [...(args.config.collections ?? [])],
      plugins,
      pluginLoadSummary: this.createConfiguredPluginLoadSummary(plugins),
      mcpServers: [...(args.config.mcpServers ?? [])],
      hasConfiguredCredentialSessionServiceRegistration,
      log: args.config.log,
      engineExecutionLimits: runtimeConfig.engineExecutionLimits,
      databaseUrl: persistence.kind === "postgresql" ? persistence.databaseUrl : undefined,
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

  private createConfiguredPluginLoadSummary(plugins: AppConfig["plugins"]): AppConfig["pluginLoadSummary"] {
    const summaries: AppPluginLoadSummary[] = [];
    for (const plugin of plugins) {
      const packageName = this.pluginPackageMetadata.readPackageName(plugin);
      if (!packageName) {
        continue;
      }
      summaries.push({
        packageName,
        source: "configured",
      });
    }
    return summaries;
  }

  /**
   * Database persistence is resolved exclusively from `CODEMATION_DATABASE_URL` (DSN format).
   * Supported schemes: `sqlite://`, `pgsql://`, `postgresql://`, `postgres://`. When the env
   * var is absent we default to a project-local SQLite file at
   * `<consumerRoot>/.codemation/codemation.sqlite` — convenient for dev, explicit for prod.
   *
   * Config-based DB settings (`runtime.database` in codemation.config.ts) are intentionally
   * not supported: keeping the resolver env-only lets the CLI skip the entire ~9s consumer
   * config load on the migrations path and lets ops swap databases without touching code.
   */
  private resolvePersistence(env: NodeJS.ProcessEnv, consumerRoot: string): AppPersistenceConfig {
    const url = env.CODEMATION_DATABASE_URL?.trim();
    if (url) {
      return this.databaseUrlParser.parse(url, consumerRoot);
    }
    return {
      kind: "sqlite",
      databaseFilePath: path.resolve(consumerRoot, ".codemation", "codemation.sqlite"),
    };
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
