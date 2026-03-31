import type { NodeExecutionRequestHandler, NodeExecutionScheduler } from "@codemation/core";

export type WorkerRuntimeHandle = Readonly<{
  stop: () => Promise<void>;
}>;

export interface WorkerRuntimeScheduler extends NodeExecutionScheduler {
  createWorker(
    args: Readonly<{
      queues: ReadonlyArray<string>;
      requestHandler: NodeExecutionRequestHandler;
    }>,
  ): WorkerRuntimeHandle;

  close(): Promise<void>;
}
