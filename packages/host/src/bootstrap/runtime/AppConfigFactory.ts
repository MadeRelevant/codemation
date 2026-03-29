import type { AppConfig } from "../../presentation/config/AppConfig";
import type { CodemationAuthConfig } from "../../presentation/config/CodemationAuthConfig";
import type { CodemationApplicationRuntimeConfig } from "../../presentation/config/CodemationConfig";
import type { CodemationWhitelabelConfig } from "../../presentation/config/CodemationWhitelabelConfig";
import { ResolvedImplementationSelectionFactory } from "./ResolvedImplementationSelectionFactory";

export class AppConfigFactory {
  constructor(
    private readonly implementationSelectionFactory: ResolvedImplementationSelectionFactory = new ResolvedImplementationSelectionFactory(),
  ) {}

  create(
    args: Readonly<{
      repoRoot: string;
      consumerRoot: string;
      env: NodeJS.ProcessEnv;
      workflowSources: ReadonlyArray<string>;
      runtimeConfig: CodemationApplicationRuntimeConfig;
      authConfig: CodemationAuthConfig | undefined;
      whitelabelConfig: CodemationWhitelabelConfig;
    }>,
  ): AppConfig {
    const selection = this.implementationSelectionFactory.resolve({
      consumerRoot: args.consumerRoot,
      env: args.env,
      runtimeConfig: args.runtimeConfig,
    });
    const workerQueues = args.runtimeConfig.scheduler?.workerQueues ?? [];
    const queuePrefix = args.runtimeConfig.scheduler?.queuePrefix ?? args.runtimeConfig.eventBus?.queuePrefix;
    const databaseUrl =
      selection.databasePersistence.kind === "postgresql"
        ? selection.databasePersistence.databaseUrl
        : args.runtimeConfig.database?.url?.trim() || undefined;

    return {
      consumerRoot: args.consumerRoot,
      repoRoot: args.repoRoot,
      env: args.env,
      workflowSources: [...args.workflowSources],
      databaseUrl,
      database: args.runtimeConfig.database,
      scheduler: {
        kind: selection.schedulerKind,
        queuePrefix,
        workerQueues,
        redisUrl: selection.redisUrl,
      },
      eventing: {
        kind: selection.eventBusKind,
        queuePrefix,
        redisUrl: selection.redisUrl,
      },
      auth: args.authConfig,
      whitelabel: args.whitelabelConfig,
    };
  }
}
