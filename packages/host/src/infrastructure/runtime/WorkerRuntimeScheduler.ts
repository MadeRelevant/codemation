import type {
  BinaryStorage,
  CredentialSessionService,
  EngineExecutionLimitsPolicy,
  NodeActivationContinuation,
  NodeExecutionScheduler,
  NodeResolver,
  WorkflowExecutionRepository,
  WorkflowDefinition,
  WorkflowId,
} from "@codemation/core";

export type WorkerRuntimeHandle = Readonly<{
  stop: () => Promise<void>;
}>;

export interface WorkerRuntimeScheduler extends NodeExecutionScheduler {
  createWorker(
    args: Readonly<{
      queues: ReadonlyArray<string>;
      workflowsById: ReadonlyMap<WorkflowId, WorkflowDefinition>;
      nodeResolver: NodeResolver;
      credentialSessions: CredentialSessionService;
      workflowExecutionRepository: WorkflowExecutionRepository;
      continuation: NodeActivationContinuation;
      binaryStorage?: BinaryStorage;
      workflows?: unknown;
      now?: () => Date;
      /** When set, must match the host engine policy so worker execution contexts use the same limits as `runtime.engineExecutionLimits`. */
      executionLimitsPolicy?: EngineExecutionLimitsPolicy;
    }>,
  ): WorkerRuntimeHandle;

  close(): Promise<void>;
}
