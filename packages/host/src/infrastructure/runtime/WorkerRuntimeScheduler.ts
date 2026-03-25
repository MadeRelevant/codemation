import type {
  BinaryStorage,
  CredentialSessionService,
  NodeActivationContinuation,
  NodeExecutionScheduler,
  NodeResolver,
  RootExecutionOptionsFactory,
  RunStateStore,
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
      runStore: RunStateStore;
      continuation: NodeActivationContinuation;
      binaryStorage?: BinaryStorage;
      workflows?: unknown;
      now?: () => Date;
      rootExecutionOptionsFactory?: RootExecutionOptionsFactory;
    }>,
  ): WorkerRuntimeHandle;

  close(): Promise<void>;
}
