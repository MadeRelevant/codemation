import type {
  ActivationIdFactory,
  ExecutionContextFactory,
  Items,
  NodeActivationId,
  NodeActivationRequest,
  NodeExecutionContext,
  NodeId,
  NodeInputsByPort,
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

export type MultiDefinitionActivationRequest = NodeActivationContextArgs & {
  definition: NodeExecutionDefinition;
  batchId: string;
  inputsByPort: NodeInputsByPort;
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

  createSingleFromDefinition(
    args: SingleDefinitionActivationRequest,
  ): Extract<NodeActivationRequest, { kind: "single" }> {
    return this.createSingleFromDefinitionWithActivation({
      ...args,
      activationId: this.activationIdFactory.makeActivationId(),
    });
  }

  createSingleFromDefinitionWithActivation(
    args: SingleDefinitionActivationRequest & Readonly<{ activationId: NodeActivationId }>,
  ): Extract<NodeActivationRequest, { kind: "single" }> {
    const ctx = this.createNodeExecutionContext(args, args.definition, args.activationId);
    return {
      kind: "single",
      runId: args.runId,
      activationId: args.activationId,
      workflowId: args.workflowId,
      nodeId: args.definition.id,
      parent: args.parent,
      executionOptions: args.executionOptions,
      batchId: args.batchId,
      input: args.input,
      ctx,
    };
  }

  createMultiFromDefinitionWithActivation(
    args: MultiDefinitionActivationRequest & Readonly<{ activationId: NodeActivationId }>,
  ): Extract<NodeActivationRequest, { kind: "multi" }> {
    const ctx = this.createNodeExecutionContext(args, args.definition, args.activationId);
    return {
      kind: "multi",
      runId: args.runId,
      activationId: args.activationId,
      workflowId: args.workflowId,
      nodeId: args.definition.id,
      parent: args.parent,
      executionOptions: args.executionOptions,
      batchId: args.batchId,
      inputsByPort: args.inputsByPort,
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
      telemetry: args.base.telemetry.forNode({ nodeId: definition.id, activationId }),
      binary: args.base.binary.forNode({ nodeId: definition.id, activationId }),
      getCredential: this.credentialResolverFactory.create(args.workflowId, definition.id, definition.config),
    };
  }
}
