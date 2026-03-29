import type { CodemationDatabaseConfig, CodemationEventBusKind, CodemationSchedulerKind } from "./CodemationConfig";
import type { CodemationAuthConfig } from "./CodemationAuthConfig";
import type { CodemationWhitelabelConfig } from "./CodemationWhitelabelConfig";

export interface AppConfig {
  readonly consumerRoot: string;
  readonly repoRoot: string;
  readonly env: Readonly<NodeJS.ProcessEnv>;
  readonly workflowSources: ReadonlyArray<string>;
  readonly databaseUrl?: string;
  readonly database?: CodemationDatabaseConfig;
  readonly scheduler: Readonly<{
    kind: CodemationSchedulerKind;
    queuePrefix?: string;
    workerQueues: ReadonlyArray<string>;
    redisUrl?: string;
  }>;
  readonly eventing: Readonly<{
    kind: CodemationEventBusKind;
    queuePrefix?: string;
    redisUrl?: string;
  }>;
  readonly auth?: CodemationAuthConfig;
  readonly whitelabel: CodemationWhitelabelConfig;
}
