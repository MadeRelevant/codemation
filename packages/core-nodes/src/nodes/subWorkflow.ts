import type {
  Items,
  Node,
  NodeConfigBase,
  NodeExecutionContext,
  NodeId,
  NodeOutputs,
  Item,
  TypeToken,
  UpstreamRefPlaceholder,
} from "@codemation/core";

export class SubWorkflow implements NodeConfigBase {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = SubWorkflowNode;
  constructor(
    public readonly name: string,
    public readonly workflowId: string,
    public upstreamRefs?: Array<{ nodeId: NodeId } | UpstreamRefPlaceholder>,
    public readonly startAt?: NodeId,
    public readonly id?: string,
  ) {}
}

export class SubWorkflowNode implements Node<SubWorkflow> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<SubWorkflow>): Promise<NodeOutputs> {
  
    const workflows = ctx.services.workflows;
    if (!workflows) throw new Error("WorkflowRunnerService is not available in ctx.services.workflows");

    const out: Item[] = [];
    for (let i = 0; i < items.length; i++) {
      const current = items[i]!;
      const result = await workflows.runById({
        workflowId: ctx.config.workflowId,
        startAt: ctx.config.startAt,
        items: [current],
        parent: { runId: ctx.runId, workflowId: ctx.workflowId, nodeId: ctx.nodeId },
      });
      if (result.status !== "completed") throw new Error(`Subworkflow ${ctx.config.workflowId} did not complete (status=${result.status})`);
      out.push(...result.outputs);
    }

    return { main: out };
  }
}

