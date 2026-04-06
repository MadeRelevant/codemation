/* eslint-disable codemation/single-class-per-file -- Runnable config and implementation share a TypeToken pairing. */
import type { WorkflowRunnerService } from "../contracts/runtimeTypes";
import type { TypeToken } from "../di";
import type {
  Item,
  Items,
  NodeExecutionContext,
  NodeId,
  NodeOutputs,
  Node,
  RunnableNodeConfig,
  WorkflowId,
} from "../types";

/**
 * Test harness subworkflow runner (mirrors integration patterns; lives under {@link "@codemation/core/testing"}).
 */
export class SubWorkflowRunnerConfig<TInputJson = unknown, TOutputJson = unknown> implements RunnableNodeConfig<
  TInputJson,
  TOutputJson
> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = SubWorkflowRunnerNode;

  constructor(
    public readonly name: string,
    public readonly args: Readonly<{
      workflowId: WorkflowId;
      startAt?: NodeId;
      id?: string;
      execution?: Readonly<{ hint?: "local" | "worker"; queue?: string }>;
    }>,
  ) {}

  get id(): string | undefined {
    return this.args.id;
  }

  get execution(): Readonly<{ hint?: "local" | "worker"; queue?: string }> | undefined {
    return this.args.execution;
  }

  get workflowId(): WorkflowId {
    return this.args.workflowId;
  }

  get startAt(): NodeId | undefined {
    return this.args.startAt;
  }
}

export class SubWorkflowRunnerNode implements Node<SubWorkflowRunnerConfig<any, any>> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  constructor(private readonly workflows: WorkflowRunnerService) {}

  async execute(items: Items, ctx: NodeExecutionContext<SubWorkflowRunnerConfig<any, any>>): Promise<NodeOutputs> {
    const out: Item[] = [];
    for (let i = 0; i < items.length; i++) {
      const current = items[i]!;
      const result = await this.workflows.runById({
        workflowId: ctx.config.workflowId,
        startAt: ctx.config.startAt,
        items: [current],
        parent: {
          runId: ctx.runId,
          workflowId: ctx.workflowId,
          nodeId: ctx.nodeId,
          subworkflowDepth: ctx.subworkflowDepth,
          engineMaxNodeActivations: ctx.engineMaxNodeActivations,
          engineMaxSubworkflowDepth: ctx.engineMaxSubworkflowDepth,
        },
      });
      if (result.status !== "completed") {
        throw new Error(`Subworkflow ${ctx.config.workflowId} did not complete (status=${result.status})`);
      }
      out.push(...result.outputs);
    }

    return { main: out };
  }
}
