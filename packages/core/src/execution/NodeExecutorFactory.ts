import type { WorkflowNodeInstanceFactory } from "../types";

import { InProcessRetryRunner } from "./InProcessRetryRunner";
import { NodeExecutor } from "./NodeExecutor";
import { RunnableOutputBehaviorResolver } from "./RunnableOutputBehaviorResolver";

export class NodeExecutorFactory {
  create(
    workflowNodeInstanceFactory: WorkflowNodeInstanceFactory,
    retryRunner: InProcessRetryRunner,
    outputBehaviorResolver: RunnableOutputBehaviorResolver,
  ): NodeExecutor {
    return new NodeExecutor(workflowNodeInstanceFactory, retryRunner, undefined, outputBehaviorResolver);
  }
}
