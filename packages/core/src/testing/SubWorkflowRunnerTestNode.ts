/* eslint-disable codemation/single-class-per-file -- Runnable config and implementation share a TypeToken pairing. */
import type { WorkflowRunnerService } from "../contracts/runtimeTypes";
import type { TypeToken } from "../di";
import type { Item, NodeId, RunnableNode, RunnableNodeConfig, RunnableNodeExecuteArgs, WorkflowId } from "../types";
import { emitPorts } from "../contracts/emitPorts";

/**
 * Test harness subworkflow runner (mirrors integration patterns; lives under {@link "@codemation/core/testing"}).
 */
export class SubWorkflowRunnerConfig<TInputJson = unknown, TOutputJson = unknown> implements RunnableNodeConfig<
  TInputJson,
  TOutputJson
> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = SubWorkflowRunnerNode;

  readonly workflowId: WorkflowId;
  readonly startAt: NodeId | undefined;

  constructor(
    public readonly name: string,
    public readonly args: Readonly<{
      workflowId: WorkflowId;
      startAt?: NodeId;
      id?: string;
      execution?: Readonly<{ hint?: "local" | "worker"; queue?: string }>;
    }>,
  ) {
    this.workflowId = args.workflowId;
    this.startAt = args.startAt;
  }

  get id(): string | undefined {
    return this.args.id;
  }

  get execution(): Readonly<{ hint?: "local" | "worker"; queue?: string }> | undefined {
    return this.args.execution;
  }
}

export class SubWorkflowRunnerNode implements RunnableNode<SubWorkflowRunnerConfig<any, any>> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  constructor(private readonly workflows: WorkflowRunnerService) {}

  async execute(args: RunnableNodeExecuteArgs<SubWorkflowRunnerConfig<any, any>>): Promise<unknown> {
    const current = args.item as Item;
    const result = await this.workflows.runById({
      workflowId: args.ctx.config.workflowId,
      startAt: args.ctx.config.startAt,
      items: [current],
      parent: {
        runId: args.ctx.runId,
        workflowId: args.ctx.workflowId,
        nodeId: args.ctx.nodeId,
        subworkflowDepth: args.ctx.subworkflowDepth,
        engineMaxNodeActivations: args.ctx.engineMaxNodeActivations,
        engineMaxSubworkflowDepth: args.ctx.engineMaxSubworkflowDepth,
      },
    });
    if (result.status !== "completed") {
      throw new Error(`Subworkflow ${args.ctx.config.workflowId} did not complete (status=${result.status})`);
    }
    return emitPorts({ main: result.outputs });
  }
}
