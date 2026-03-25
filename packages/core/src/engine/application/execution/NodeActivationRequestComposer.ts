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
} from "../../../types";

import type { PlannedActivation } from "../../domain/planning/runQueuePlanner";

import { CredentialResolverFactory } from "../credentials/CredentialResolverFactory";

/**
 * Builds {@link NodeActivationRequest} values shared by workflow starters and continuation.
 */
export class NodeActivationRequestComposer {
  constructor(
    private readonly activationIdFactory: ActivationIdFactory,
    private readonly credentialResolverFactory: CredentialResolverFactory,
  ) {}

  createSingleFromDefinition(args: {
    runId: RunId;
    workflowId: WorkflowId;
    definition: Readonly<{ id: NodeId; config: NodeExecutionContext["config"] }>;
    parent?: ParentExecutionRef;
    executionOptions?: RunExecutionOptions;
    batchId: string;
    input: Items;
    base: ReturnType<ExecutionContextFactory["create"]>;
    data: ReturnType<RunDataFactory["create"]>;
  }): NodeActivationRequest {
    const activationId = this.activationIdFactory.makeActivationId();
    const ctx: NodeExecutionContext = {
      ...args.base,
      data: args.data,
      nodeId: args.definition.id,
      activationId,
      config: args.definition.config,
      binary: args.base.binary.forNode({ nodeId: args.definition.id, activationId }),
      getCredential: this.credentialResolverFactory.create(args.workflowId, args.definition.id, args.definition.config),
    };
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

  createFromPlannedActivation(args: {
    next: PlannedActivation;
    base: ReturnType<ExecutionContextFactory["create"]>;
    data: ReturnType<RunDataFactory["create"]>;
    runId: RunId;
    workflowId: WorkflowId;
    parent?: ParentExecutionRef;
    executionOptions?: RunExecutionOptions;
    nodeDefinition: Readonly<{ id: NodeId; config: NodeExecutionContext["config"] }>;
  }): NodeActivationRequest {
    const activationId = this.activationIdFactory.makeActivationId();
    const ctx: NodeExecutionContext = {
      ...args.base,
      data: args.data,
      nodeId: args.nodeDefinition.id,
      activationId,
      config: args.nodeDefinition.config,
      binary: args.base.binary.forNode({ nodeId: args.nodeDefinition.id, activationId }),
      getCredential: this.credentialResolverFactory.create(
        args.workflowId,
        args.nodeDefinition.id,
        args.nodeDefinition.config,
      ),
    };
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
}
