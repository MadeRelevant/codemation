import type {
  ActivationIdFactory,
  ExecutionContextFactory,
  Items,
  NodeActivationRequest,
  NodeExecutionContext,
  NodeId,
  ParentExecutionRef,
  RunDataFactory,
  RunExecutionOptions,
  RunId,
  WorkflowId,
} from "../types";

import type { PlannedActivation } from "../planning/RunQueuePlanner";

import { CredentialResolverFactory } from "./CredentialResolverFactory";

type NodeExecutionDefinition = Readonly<{ id: NodeId; config: NodeExecutionContext["config"] }>;

type NodeActivationContextArgs = {
  runId: RunId;
  workflowId: WorkflowId;
  parent?: ParentExecutionRef;
  executionOptions?: RunExecutionOptions;
  base: ReturnType<ExecutionContextFactory["create"]>;
  data: ReturnType<RunDataFactory["create"]>;
};

export type SingleDefinitionActivationRequest = NodeActivationContextArgs & {
  definition: NodeExecutionDefinition;
  batchId: string;
  input: Items;
};

export type PlannedNodeActivationRequest = NodeActivationContextArgs & {
  next: PlannedActivation;
  nodeDefinition: NodeExecutionDefinition;
};

/**
 * Builds {@link NodeActivationRequest} values shared by workflow starters and continuation.
 */
export class NodeActivationRequestComposer {
  constructor(
    private readonly activationIdFactory: ActivationIdFactory,
    private readonly credentialResolverFactory: CredentialResolverFactory,
  ) {}

  createSingleFromDefinition(args: SingleDefinitionActivationRequest): NodeActivationRequest {
    const activationId = this.activationIdFactory.makeActivationId();
    const ctx = this.createNodeExecutionContext(args, args.definition, activationId);
    return {
      kind: "single",
      runId: args.runId,
      activationId,
      workflowId: args.workflowId,
      nodeId: args.definition.id,
      parent: args.parent,
      executionOptions: args.executionOptions,
      batchId: args.batchId,
      input: args.input,
      ctx,
    };
  }

  createFromPlannedActivation(args: PlannedNodeActivationRequest): NodeActivationRequest {
    const activationId = this.activationIdFactory.makeActivationId();
    const ctx = this.createNodeExecutionContext(args, args.nodeDefinition, activationId);
    if (args.next.kind === "multi") {
      return {
        kind: "multi",
        runId: args.runId,
        activationId,
        workflowId: args.workflowId,
        nodeId: args.nodeDefinition.id,
        parent: args.parent,
        executionOptions: args.executionOptions,
        batchId: args.next.batchId,
        inputsByPort: args.next.inputsByPort,
        ctx,
      };
    }
    return {
      kind: "single",
      runId: args.runId,
      activationId,
      workflowId: args.workflowId,
      nodeId: args.nodeDefinition.id,
      parent: args.parent,
      executionOptions: args.executionOptions,
      batchId: args.next.batchId,
      input: args.next.input,
      ctx,
    };
  }

  private createNodeExecutionContext(
    args: NodeActivationContextArgs,
    definition: NodeExecutionDefinition,
    activationId: string,
  ): NodeExecutionContext {
    return {
      ...args.base,
      data: args.data,
      nodeId: definition.id,
      activationId,
      config: definition.config,
      binary: args.base.binary.forNode({ nodeId: definition.id, activationId }),
      getCredential: this.credentialResolverFactory.create(args.workflowId, definition.id, definition.config),
    };
  }
}
