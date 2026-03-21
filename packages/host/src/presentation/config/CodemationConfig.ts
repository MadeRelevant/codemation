import type { Container,TypeToken,WorkflowDefinition } from "@codemation/core";
import type { CodemationApplication } from "../../codemationApplication";
import type { CodemationAppSlots } from "./CodemationAppSlots";
import type { CodemationAuthConfig } from "./CodemationAuthConfig";
import type { CodemationBinding } from "./CodemationBinding";
import type { CodemationPlugin } from "./CodemationPlugin";
import type { CodemationWorkflowDiscovery } from "./CodemationWorkflowDiscovery";

export type CodemationEventBusKind = "memory" | "redis";
export type CodemationSchedulerKind = "local" | "bullmq";
export type CodemationDatabaseKind = "postgresql";

export interface CodemationDatabaseConfig {
  readonly kind?: CodemationDatabaseKind;
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

export interface CodemationBootContext {
  readonly application: CodemationApplication;
  readonly container: Container;
  readonly consumerRoot: string;
  readonly repoRoot: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly discoveredWorkflows: ReadonlyArray<WorkflowDefinition>;
  readonly workflowSources: ReadonlyArray<string>;
}

export interface CodemationBootHook {
  boot(context: CodemationBootContext): void | Promise<void>;
}

export interface CodemationConfig {
  readonly runtime?: CodemationApplicationRuntimeConfig;
  readonly workflows?: ReadonlyArray<WorkflowDefinition>;
  readonly workflowDiscovery?: CodemationWorkflowDiscovery;
  readonly bindings?: ReadonlyArray<CodemationBinding<unknown>>;
  readonly plugins?: ReadonlyArray<CodemationPlugin>;
  readonly bootHook?: TypeToken<CodemationBootHook>;
  readonly slots?: CodemationAppSlots;
  /** Required for production hosts; optional only when using development bypass (never in production). */
  readonly auth?: CodemationAuthConfig;
}
