import type {
  AnyCredentialType,
  CollectionDefinition,
  Container,
  DefinedCollection,
  TypeToken,
  WorkflowDefinition,
} from "@codemation/core";
import type { CodemationContainerRegistration } from "../../bootstrap/CodemationContainerRegistration";
import type { CodemationAppContext } from "./CodemationAppContext";
import type { CodemationAuthConfig } from "./CodemationAuthConfig";
import type { CodemationClassToken } from "./CodemationClassToken";
import type {
  CodemationApplicationRuntimeConfig,
  CodemationConfig,
  CodemationDatabaseConfig,
  CodemationEventBusConfig,
  CodemationSchedulerConfig,
} from "./CodemationConfig";

export type NormalizedCodemationConfig = Omit<CodemationConfig, "collections"> &
  Readonly<{
    containerRegistrations: ReadonlyArray<CodemationContainerRegistration<unknown>>;
    collections: ReadonlyArray<CollectionDefinition>;
  }>;

export class CodemationConfigNormalizer {
  normalize(config: CodemationConfig): NormalizedCodemationConfig {
    const auth = config.app?.auth ?? config.auth;
    this.assertAuthConfig(auth);
    this.assertManagedModeConstraints(config, auth);
    const collected = this.collectRegistration(config);
    const normalizedRuntime = this.normalizeRuntimeConfig(config);
    const normalizedWorkflowDiscoveryDirectories = [
      ...(config.workflowDiscovery?.directories ?? []),
      ...collected.workflowDirectories,
    ];

    return {
      ...config,
      auth,
      containerRegistrations: collected.containerRegistrations,
      credentialTypes: [...(config.credentialTypes ?? []), ...collected.credentialTypes],
      collections: [...this.unwrapCollections(config.collections), ...collected.collections],
      log: config.app?.log ?? config.log,
      runtime: normalizedRuntime,
      whitelabel: config.app?.whitelabel ?? config.whitelabel,
      workflowDiscovery:
        normalizedWorkflowDiscoveryDirectories.length > 0
          ? { directories: normalizedWorkflowDiscoveryDirectories }
          : config.workflowDiscovery,
      workflows: this.mergeWorkflows(config.workflows ?? [], collected.workflows),
    };
  }

  /**
   * Enforces managed-mode invariants beyond what `assertAuthConfig` covers:
   * managed-mode workspaces are always Postgres and always require at least one workflow source.
   */
  private assertManagedModeConstraints(config: CodemationConfig, auth: CodemationAuthConfig | undefined): void {
    if (auth?.kind !== "managed") {
      return;
    }
    const dbKind = config.app?.database?.kind;
    if (dbKind === "sqlite") {
      throw new Error(
        'Managed-mode workspaces require PostgreSQL. Set database.kind to "postgresql" (SQLite is not supported with auth.kind: "managed").',
      );
    }
    const hasWorkflows = (config.workflows?.length ?? 0) > 0;
    const hasWorkflowDiscovery = (config.workflowDiscovery?.directories?.length ?? 0) > 0;
    if (!hasWorkflows && !hasWorkflowDiscovery) {
      throw new Error(
        'Managed-mode workspaces require at least one workflow source. Provide "workflows" or "workflowsDir" (which maps to workflowDiscovery.directories) in defineCodemationApp.',
      );
    }
  }

  private collectRegistration(config: CodemationConfig): Readonly<{
    containerRegistrations: ReadonlyArray<CodemationContainerRegistration<unknown>>;
    credentialTypes: ReadonlyArray<AnyCredentialType>;
    collections: ReadonlyArray<CollectionDefinition>;
    workflows: ReadonlyArray<WorkflowDefinition>;
    workflowDirectories: ReadonlyArray<string>;
  }> {
    if (!config.register) {
      return {
        containerRegistrations: [],
        credentialTypes: [],
        collections: [],
        workflows: [],
        workflowDirectories: [],
      };
    }

    const containerRegistrations: Array<CodemationContainerRegistration<unknown>> = [];
    const credentialTypes: Array<AnyCredentialType> = [];
    const collections: Array<CollectionDefinition> = [];
    const workflows: Array<WorkflowDefinition> = [];
    const workflowDirectories: Array<string> = [];

    const context: CodemationAppContext = {
      registerCredentialType(type) {
        credentialTypes.push(type);
      },
      registerCollection(definition) {
        collections.push(definition);
      },
      registerNode<TValue>(token: TypeToken<TValue>, implementation?: CodemationClassToken<TValue>) {
        containerRegistrations.push({
          token,
          useClass: implementation ?? (token as CodemationClassToken<TValue>),
        });
      },
      registerValue<TValue>(token: TypeToken<TValue>, value: TValue) {
        containerRegistrations.push({ token, useValue: value });
      },
      registerClass<TValue>(token: TypeToken<TValue>, implementation: CodemationClassToken<TValue>) {
        containerRegistrations.push({ token, useClass: implementation });
      },
      registerFactory<TValue>(token: TypeToken<TValue>, factory: (container: Container) => TValue) {
        containerRegistrations.push({ token, useFactory: factory });
      },
      registerWorkflow(workflow: WorkflowDefinition) {
        workflows.push(workflow);
      },
      registerWorkflows(nextWorkflows: ReadonlyArray<WorkflowDefinition>) {
        workflows.push(...nextWorkflows);
      },
      discoverWorkflows(...directories: ReadonlyArray<string>) {
        workflowDirectories.push(...directories);
      },
    };

    config.register(context);

    return {
      containerRegistrations,
      credentialTypes,
      collections,
      workflows,
      workflowDirectories,
    };
  }

  private unwrapCollections(
    entries: ReadonlyArray<CollectionDefinition | DefinedCollection> | undefined,
  ): ReadonlyArray<CollectionDefinition> {
    if (!entries) return [];
    return entries.map((entry) => (this.isDefinedCollection(entry) ? entry.definition : entry));
  }

  private isDefinedCollection(entry: CollectionDefinition | DefinedCollection): entry is DefinedCollection {
    return "kind" in entry && entry.kind === "defined-collection";
  }

  private normalizeRuntimeConfig(config: CodemationConfig): CodemationApplicationRuntimeConfig | undefined {
    if (!config.app) {
      return config.runtime;
    }
    const nextRuntime: CodemationApplicationRuntimeConfig = {
      ...(config.runtime ?? {}),
      frontendPort: config.app.frontendPort ?? config.runtime?.frontendPort,
      database: this.normalizeDatabaseConfig(config),
      eventBus: this.normalizeEventBusConfig(config),
      scheduler: this.normalizeSchedulerConfig(config),
      engineExecutionLimits: config.app.engineExecutionLimits ?? config.runtime?.engineExecutionLimits,
    };
    return nextRuntime;
  }

  private normalizeDatabaseConfig(config: CodemationConfig): CodemationDatabaseConfig | undefined {
    if (!config.app) {
      return config.runtime?.database;
    }
    if (config.app.database) {
      return config.app.database;
    }
    if (!config.app.databaseUrl) {
      return config.runtime?.database;
    }
    return {
      ...(config.runtime?.database ?? {}),
      url: config.app.databaseUrl,
    };
  }

  private normalizeSchedulerConfig(config: CodemationConfig): CodemationSchedulerConfig | undefined {
    if (!config.app?.scheduler) {
      return config.runtime?.scheduler;
    }
    const scheduler = config.app.scheduler;
    return {
      ...(config.runtime?.scheduler ?? {}),
      kind:
        scheduler.kind === "queue" ? "bullmq" : scheduler.kind === "inline" ? "local" : config.runtime?.scheduler?.kind,
      queuePrefix: scheduler.queuePrefix ?? config.runtime?.scheduler?.queuePrefix,
      workerQueues: scheduler.workerQueues ?? config.runtime?.scheduler?.workerQueues,
    };
  }

  private normalizeEventBusConfig(config: CodemationConfig): CodemationEventBusConfig | undefined {
    if (!config.app?.scheduler) {
      return config.runtime?.eventBus;
    }
    const scheduler = config.app.scheduler;
    const eventBusKind =
      scheduler.kind === "queue" ? "redis" : scheduler.kind === "inline" ? "memory" : config.runtime?.eventBus?.kind;
    return {
      ...(config.runtime?.eventBus ?? {}),
      kind: eventBusKind,
      queuePrefix: scheduler.queuePrefix ?? config.runtime?.eventBus?.queuePrefix,
      redisUrl: scheduler.redisUrl ?? config.runtime?.eventBus?.redisUrl,
    };
  }

  private assertAuthConfig(authConfig: CodemationConfig["auth"]): void {
    if (authConfig?.kind !== "managed") {
      return;
    }
    if (authConfig.oauth && authConfig.oauth.length > 0) {
      throw new Error('auth.kind "managed" cannot be combined with oauth providers. Remove the oauth config.');
    }
    if (authConfig.oidc && authConfig.oidc.length > 0) {
      throw new Error('auth.kind "managed" cannot be combined with oidc providers. Remove the oidc config.');
    }
    if (authConfig.allowUnauthenticatedInDevelopment === true) {
      throw new Error(
        'auth.kind "managed" cannot be combined with allowUnauthenticatedInDevelopment. Remove that flag.',
      );
    }
  }

  private mergeWorkflows(
    configuredWorkflows: ReadonlyArray<WorkflowDefinition>,
    registeredWorkflows: ReadonlyArray<WorkflowDefinition>,
  ): ReadonlyArray<WorkflowDefinition> | undefined {
    if (configuredWorkflows.length === 0 && registeredWorkflows.length === 0) {
      return undefined;
    }
    const workflowsById = new Map<string, WorkflowDefinition>();
    for (const workflow of registeredWorkflows) {
      workflowsById.set(workflow.id, workflow);
    }
    for (const workflow of configuredWorkflows) {
      workflowsById.set(workflow.id, workflow);
    }
    return [...workflowsById.values()];
  }
}
