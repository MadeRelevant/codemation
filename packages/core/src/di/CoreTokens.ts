import type { TypeToken } from "./index";
import type { RunEventBus } from "../events/runEvents";
import type { EngineExecutionLimitsPolicy } from "../policies/executionLimits/EngineExecutionLimitsPolicy";
import type {
  ActivationIdFactory,
  BinaryStorage,
  CredentialSessionService,
  CredentialTypeRegistry,
  ExecutionContextFactory,
  LiveWorkflowRepository,
  NodeActivationScheduler,
  NodeResolver,
  PersistedWorkflowTokenRegistryLike,
  RunDataFactory,
  RunIdFactory,
  TriggerSetupStateRepository,
  WorkflowExecutionRepository,
  WorkflowNodeInstanceFactory,
  WorkflowActivationPolicy,
  WorkflowRepository,
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
  LiveWorkflowRepository: Symbol.for("codemation.core.LiveWorkflowRepository") as TypeToken<LiveWorkflowRepository>,
  WorkflowRepository: Symbol.for("codemation.core.WorkflowRepository") as TypeToken<WorkflowRepository>,
  NodeResolver: Symbol.for("codemation.core.NodeResolver") as TypeToken<NodeResolver>,
  WorkflowNodeInstanceFactory: Symbol.for(
    "codemation.core.WorkflowNodeInstanceFactory",
  ) as TypeToken<WorkflowNodeInstanceFactory>,
  RunIdFactory: Symbol.for("codemation.core.RunIdFactory") as TypeToken<RunIdFactory>,
  ActivationIdFactory: Symbol.for("codemation.core.ActivationIdFactory") as TypeToken<ActivationIdFactory>,
  WorkflowExecutionRepository: Symbol.for(
    "codemation.core.WorkflowExecutionRepository",
  ) as TypeToken<WorkflowExecutionRepository>,
  TriggerSetupStateRepository: Symbol.for(
    "codemation.core.TriggerSetupStateRepository",
  ) as TypeToken<TriggerSetupStateRepository>,
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
  WorkflowActivationPolicy: Symbol.for(
    "codemation.core.WorkflowActivationPolicy",
  ) as TypeToken<WorkflowActivationPolicy>,
} as const;
