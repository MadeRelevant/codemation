import type { AnyCredentialType, EngineExecutionLimitsPolicyConfig, WorkflowDefinition } from "@codemation/core";
import type { CodemationAuthConfig } from "./CodemationAuthConfig";
import type { CodemationAppContext } from "./CodemationAppContext";
import type { CodemationPlugin } from "./CodemationPlugin";
import type { CodemationLogConfig } from "./CodemationLogConfig";
import type { CodemationWhitelabelConfig } from "./CodemationWhitelabelConfig";
import type { CodemationWorkflowDiscovery } from "./CodemationWorkflowDiscovery";

export type CodemationEventBusKind = "memory" | "redis";
export type CodemationSchedulerKind = "local" | "bullmq";
export type CodemationDatabaseKind = "postgresql" | "pglite";

export interface CodemationDatabaseConfig {
  readonly kind?: CodemationDatabaseKind;
  /** TCP PostgreSQL URL when `kind` is `postgresql` (or omitted with a postgres URL). */
  readonly url?: string;
  /** Directory for embedded PGlite data when `kind` is `pglite`. Relative paths resolve from the consumer app root. */
  readonly pgliteDataDir?: string;
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

export type CodemationAppSchedulerKind = "inline" | "queue";

export interface CodemationAppSchedulerConfig {
  readonly kind?: CodemationAppSchedulerKind;
  readonly queuePrefix?: string;
  readonly workerQueues?: ReadonlyArray<string>;
  readonly redisUrl?: string;
}

/**
 * Optional overrides for engine execution limits (activation budget and subworkflow depth caps).
 * Omitted fields keep framework defaults. Advanced users can bind `CoreTokens.EngineExecutionLimitsPolicy` for full control.
 */
export type CodemationEngineExecutionLimitsConfig = Readonly<Partial<EngineExecutionLimitsPolicyConfig>>;

export interface CodemationAppDefinition {
  readonly frontendPort?: number;
  readonly databaseUrl?: string;
  readonly database?: CodemationDatabaseConfig;
  readonly scheduler?: CodemationAppSchedulerConfig;
  readonly auth?: CodemationAuthConfig;
  readonly whitelabel?: CodemationWhitelabelConfig;
  readonly log?: CodemationLogConfig;
  readonly engineExecutionLimits?: CodemationEngineExecutionLimitsConfig;
}

export interface CodemationApplicationRuntimeConfig {
  readonly frontendPort?: number;
  readonly database?: CodemationDatabaseConfig;
  readonly eventBus?: CodemationEventBusConfig;
  readonly scheduler?: CodemationSchedulerConfig;
  /** Merged with engine defaults when building the execution limits policy (API + workers). */
  readonly engineExecutionLimits?: CodemationEngineExecutionLimitsConfig;
}

export interface CodemationConfig {
  readonly app?: CodemationAppDefinition;
  readonly register?: (context: CodemationAppContext) => void;
  readonly runtime?: CodemationApplicationRuntimeConfig;
  readonly workflows?: ReadonlyArray<WorkflowDefinition>;
  readonly workflowDiscovery?: CodemationWorkflowDiscovery;
  readonly plugins?: ReadonlyArray<CodemationPlugin>;
  /** Consumer-defined `CredentialType` entries (see `@codemation/core`), applied when the host loads config. */
  readonly credentialTypes?: ReadonlyArray<AnyCredentialType>;
  /** Optional shell whitelabel (product name, logo path). */
  readonly whitelabel?: CodemationWhitelabelConfig;
  /** Required for production hosts; optional only when using development bypass (never in production). */
  readonly auth?: CodemationAuthConfig;
  /**
   * Namespace-level log filters (first matching rule wins). Unmatched namespaces use `CODEMATION_LOG_LEVEL` / defaults.
   * Omit to keep env-only behavior.
   */
  readonly log?: CodemationLogConfig;
}
