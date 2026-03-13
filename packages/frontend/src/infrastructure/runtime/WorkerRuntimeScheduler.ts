import type {
  CredentialService,
  NodeActivationContinuation,
  NodeExecutionScheduler,
  NodeResolver,
  RunStateStore,
  WorkflowDefinition,
  WorkflowId,
} from "@codemation/core";

export type WorkerRuntimeHandle = Readonly<{
  stop: () => Promise<void>;
}>;

export interface WorkerRuntimeScheduler extends NodeExecutionScheduler {
  createWorker(args: Readonly<{
    queues: ReadonlyArray<string>;
    workflowsById: ReadonlyMap<WorkflowId, WorkflowDefinition>;
    nodeResolver: NodeResolver;
    credentials: CredentialService;
    runStore: RunStateStore;
    continuation: NodeActivationContinuation;
    workflows?: unknown;
    now?: () => Date;
  }>): WorkerRuntimeHandle;

  close(): Promise<void>;
}
