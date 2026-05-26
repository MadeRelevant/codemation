import type { PersistedRunState, RunId, WorkflowNodeInstanceFactory } from "../types";

import { InProcessRetryRunner } from "./InProcessRetryRunner";
import { NodeExecutor } from "./NodeExecutor";
import { NodeSuspensionHandler } from "./NodeSuspensionHandler";
import { RunnableOutputBehaviorResolver } from "./RunnableOutputBehaviorResolver";

export class NodeExecutorFactory {
  create(
    workflowNodeInstanceFactory: WorkflowNodeInstanceFactory,
    retryRunner: InProcessRetryRunner,
    outputBehaviorResolver: RunnableOutputBehaviorResolver,
    suspensionHandler?: NodeSuspensionHandler,
    loadRunState?: (runId: RunId) => Promise<PersistedRunState | undefined>,
  ): NodeExecutor {
    return new NodeExecutor(
      workflowNodeInstanceFactory,
      retryRunner,
      undefined,
      outputBehaviorResolver,
      suspensionHandler,
      loadRunState,
    );
  }
}
