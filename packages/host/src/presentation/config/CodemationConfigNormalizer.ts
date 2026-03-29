import type { AnyCredentialType, Container, TypeToken, WorkflowDefinition } from "@codemation/core";
import type { CodemationContainerRegistration } from "../../bootstrap/CodemationContainerRegistration";
import type { CodemationAppContext } from "./CodemationAppContext";
import type { CodemationClassToken } from "./CodemationClassToken";
import type {
  CodemationApplicationRuntimeConfig,
  CodemationConfig,
  CodemationDatabaseConfig,
  CodemationEventBusConfig,
  CodemationSchedulerConfig,
} from "./CodemationConfig";

export type NormalizedCodemationConfig = CodemationConfig &
  Readonly<{
    containerRegistrations: ReadonlyArray<CodemationContainerRegistration<unknown>>;
  }>;

export class CodemationConfigNormalizer {
  normalize(config: CodemationConfig): NormalizedCodemationConfig {
    const collected = this.collectRegistration(config);
    const normalizedRuntime = this.normalizeRuntimeConfig(config);
    const normalizedWorkflowDiscoveryDirectories = [
      ...(config.workflowDiscovery?.directories ?? []),
      ...collected.workflowDirectories,
    ];

    return {
      ...config,
      auth: config.app?.auth ?? config.auth,
      containerRegistrations: collected.containerRegistrations,
      credentialTypes: [...(config.credentialTypes ?? []), ...collected.credentialTypes],
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

  private collectRegistration(config: CodemationConfig): Readonly<{
    containerRegistrations: ReadonlyArray<CodemationContainerRegistration<unknown>>;
    credentialTypes: ReadonlyArray<AnyCredentialType>;
    workflows: ReadonlyArray<WorkflowDefinition>;
    workflowDirectories: ReadonlyArray<string>;
  }> {
    if (!config.register) {
      return {
        containerRegistrations: [],
        credentialTypes: [],
        workflows: [],
        workflowDirectories: [],
      };
    }

    const containerRegistrations: Array<CodemationContainerRegistration<unknown>> = [];
    const credentialTypes: Array<AnyCredentialType> = [];
    const workflows: Array<WorkflowDefinition> = [];
    const workflowDirectories: Array<string> = [];

    const context: CodemationAppContext = {
      registerCredentialType(type) {
        credentialTypes.push(type);
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
      workflows,
      workflowDirectories,
    };
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
