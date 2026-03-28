import type { WorkflowNodeInstanceFactory } from "../types";

import { InProcessRetryRunner } from "./InProcessRetryRunner";
import { NodeExecutor } from "./NodeExecutor";

export class NodeExecutorFactory {
  create(workflowNodeInstanceFactory: WorkflowNodeInstanceFactory, retryRunner: InProcessRetryRunner): NodeExecutor {
    return new NodeExecutor(workflowNodeInstanceFactory, retryRunner);
  }
}
