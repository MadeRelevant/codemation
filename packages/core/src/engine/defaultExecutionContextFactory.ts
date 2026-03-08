import type { ExecutionContext, ExecutionContextFactory, ExecutionServices, ParentExecutionRef, RunDataSnapshot, RunId, WorkflowId } from "../types";

export class DefaultExecutionContextFactory implements ExecutionContextFactory {
  create(args: {
    runId: RunId;
    workflowId: WorkflowId;
    parent?: ParentExecutionRef;
    services: ExecutionServices;
    data: RunDataSnapshot;
  }): ExecutionContext {
    return {
      runId: args.runId,
      workflowId: args.workflowId,
      parent: args.parent,
      now: () => new Date(),
      services: args.services,
      data: args.data,
    };
  }
}

