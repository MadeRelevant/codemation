import type { ExecutionContext, ExecutionContextFactory, NodeExecutionStatePublisher, ParentExecutionRef, RunDataSnapshot, RunId, WorkflowId } from "../../types";

export class DefaultExecutionContextFactory implements ExecutionContextFactory {
  create(args: {
    runId: RunId;
    workflowId: WorkflowId;
    parent?: ParentExecutionRef;
    data: RunDataSnapshot;
    nodeState?: NodeExecutionStatePublisher;
  }): ExecutionContext {
    return {
      runId: args.runId,
      workflowId: args.workflowId,
      parent: args.parent,
      now: () => new Date(),
      data: args.data,
      nodeState: args.nodeState,
    };
  }
}

