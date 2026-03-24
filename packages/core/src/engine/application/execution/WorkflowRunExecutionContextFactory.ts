import type {
  ExecutionContextFactory,
  NodeExecutionStatePublisher,
  NodeId,
  ParentExecutionRef,
  RunDataFactory,
  RunId,
  WorkflowId,
} from "../../../types";

import { CredentialResolverFactory } from "../credentials/CredentialResolverFactory";

/**
 * Shared {@link ExecutionContextFactory#create} wiring for workflow runners (base context before node-specific fields).
 */
export class WorkflowRunExecutionContextFactory {
  constructor(
    private readonly executionContextFactory: ExecutionContextFactory,
    private readonly credentialResolverFactory: CredentialResolverFactory,
  ) {}

  create(args: {
    runId: RunId;
    workflowId: WorkflowId;
    nodeId: NodeId;
    parent?: ParentExecutionRef;
    subworkflowDepth: number;
    engineMaxNodeActivations: number;
    engineMaxSubworkflowDepth: number;
    data: ReturnType<RunDataFactory["create"]>;
    nodeState?: NodeExecutionStatePublisher;
  }) {
    return this.executionContextFactory.create({
      runId: args.runId,
      workflowId: args.workflowId,
      parent: args.parent,
      subworkflowDepth: args.subworkflowDepth,
      engineMaxNodeActivations: args.engineMaxNodeActivations,
      engineMaxSubworkflowDepth: args.engineMaxSubworkflowDepth,
      data: args.data,
      nodeState: args.nodeState,
      getCredential: this.credentialResolverFactory.create(args.workflowId, args.nodeId),
    });
  }
}
