import type { AnyCredentialType, WorkflowDefinition } from "@codemation/core";
import type { CodemationContainerRegistration } from "../../bootstrap/CodemationContainerRegistration";
import type { CodemationPlugin } from "./CodemationPlugin";
import type {
  CodemationDatabaseConfig,
  CodemationEngineExecutionLimitsConfig,
  CodemationEventBusKind,
  CodemationSchedulerKind,
} from "./CodemationConfig";
import type { CodemationLogConfig } from "./CodemationLogConfig";
import type { CodemationAuthConfig } from "./CodemationAuthConfig";
import type { CodemationWhitelabelConfig } from "./CodemationWhitelabelConfig";

export type AppPersistenceConfig =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "postgresql"; databaseUrl: string }>
  | Readonly<{ kind: "pglite"; dataDir: string }>;

export interface AppConfig {
  readonly consumerRoot: string;
  readonly repoRoot: string;
  readonly env: Readonly<NodeJS.ProcessEnv>;
  readonly workflowSources: ReadonlyArray<string>;
  readonly workflows: ReadonlyArray<WorkflowDefinition>;
  readonly containerRegistrations: ReadonlyArray<CodemationContainerRegistration<unknown>>;
  readonly credentialTypes: ReadonlyArray<AnyCredentialType>;
  readonly plugins: ReadonlyArray<CodemationPlugin>;
  readonly hasConfiguredCredentialSessionServiceRegistration: boolean;
  readonly log?: CodemationLogConfig;
  readonly engineExecutionLimits?: CodemationEngineExecutionLimitsConfig;
  readonly databaseUrl?: string;
  readonly database?: CodemationDatabaseConfig;
  readonly persistence: AppPersistenceConfig;
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
  readonly webSocketPort: number;
  readonly webSocketBindHost: string;
}
