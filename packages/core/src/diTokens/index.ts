import type { TypeToken } from "../di";
import type { RunEventBus } from "../events/runEvents";
import type { EngineExecutionLimitsPolicy } from "../engine/application/policies/EngineExecutionLimitsPolicy";
import type {
  ActivationIdFactory,
  BinaryStorage,
  CredentialSessionService,
  CredentialTypeRegistry,
  ExecutionContextFactory,
  NodeActivationScheduler,
  NodeResolver,
  PersistedWorkflowTokenRegistryLike,
  RunDataFactory,
  RunIdFactory,
  RunStateStore,
  TriggerSetupStateStore,
  WorkflowCatalog,
  WorkflowRepository,
  WorkflowRegistry,
  WorkflowRunnerResolver,
  WorkflowRunnerService,
} from "../types";

export const CoreTokens = {
  PersistedWorkflowTokenRegistry: Symbol.for(
    "codemation.core.PersistedWorkflowTokenRegistry",
  ) as TypeToken<PersistedWorkflowTokenRegistryLike>,
  CredentialSessionService: Symbol.for(
    "codemation.core.CredentialSessionService",
  ) as TypeToken<CredentialSessionService>,
  CredentialTypeRegistry: Symbol.for("codemation.core.CredentialTypeRegistry") as TypeToken<CredentialTypeRegistry>,
  WorkflowRunnerService: Symbol.for("codemation.core.WorkflowRunnerService") as TypeToken<WorkflowRunnerService>,
  WorkflowRunnerResolver: Symbol.for("codemation.core.WorkflowRunnerResolver") as TypeToken<WorkflowRunnerResolver>,
  WorkflowCatalog: Symbol.for("codemation.core.WorkflowCatalog") as TypeToken<WorkflowCatalog>,
  WorkflowRepository: Symbol.for("codemation.core.WorkflowRepository") as TypeToken<WorkflowRepository>,
  /** @deprecated Prefer {@link CoreTokens.WorkflowCatalog} for mutable workflow storage. */
  WorkflowRegistry: Symbol.for("codemation.core.WorkflowRegistry") as TypeToken<WorkflowRegistry>,
  ServiceContainer: Symbol.for("codemation.core.ServiceContainer") as TypeToken<import("../di").Container>,
  NodeResolver: Symbol.for("codemation.core.NodeResolver") as TypeToken<NodeResolver>,
  RunIdFactory: Symbol.for("codemation.core.RunIdFactory") as TypeToken<RunIdFactory>,
  ActivationIdFactory: Symbol.for("codemation.core.ActivationIdFactory") as TypeToken<ActivationIdFactory>,
  RunStateStore: Symbol.for("codemation.core.RunStateStore") as TypeToken<RunStateStore>,
  TriggerSetupStateStore: Symbol.for("codemation.core.TriggerSetupStateStore") as TypeToken<TriggerSetupStateStore>,
  NodeActivationScheduler: Symbol.for("codemation.core.NodeActivationScheduler") as TypeToken<NodeActivationScheduler>,
  RunDataFactory: Symbol.for("codemation.core.RunDataFactory") as TypeToken<RunDataFactory>,
  ExecutionContextFactory: Symbol.for("codemation.core.ExecutionContextFactory") as TypeToken<ExecutionContextFactory>,
  RunEventBus: Symbol.for("codemation.core.RunEventBus") as TypeToken<RunEventBus>,
  BinaryStorage: Symbol.for("codemation.core.BinaryStorage") as TypeToken<BinaryStorage>,
  WebhookBasePath: Symbol.for("codemation.core.WebhookBasePath") as TypeToken<string>,
  /** Engine execution limits (defaults + optional host overrides). Consumers may bind a custom instance to override. */
  EngineExecutionLimitsPolicy: Symbol.for(
    "codemation.core.EngineExecutionLimitsPolicy",
  ) as TypeToken<EngineExecutionLimitsPolicy>,
} as const;
