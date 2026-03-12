import type {
  Items,
  Node,
  NodeExecutionContext,
  NodeId,
  NodeOutputs,
  Item,
  RunnableNodeConfig,
  TypeToken,
  UpstreamRefPlaceholder,
} from "@codemation/core";

export class SubWorkflow<TInputJson = unknown, TOutputJson = unknown> implements RunnableNodeConfig<TInputJson, TOutputJson> {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = SubWorkflowNode;
  readonly tokenId = "codemation.core-nodes.sub-workflow";
  constructor(
    public readonly name: string,
    public readonly workflowId: string,
    public upstreamRefs?: Array<{ nodeId: NodeId } | UpstreamRefPlaceholder>,
    public readonly startAt?: NodeId,
    public readonly id?: string,
  ) {}
}

export class SubWorkflowNode implements Node<SubWorkflow<any, any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<SubWorkflow<any, any>>): Promise<NodeOutputs> {
  
    const workflows = ctx.services.workflows;
    if (!workflows) throw new Error("WorkflowRunnerService is not available in ctx.services.workflows");

    const out: Item[] = [];
    for (let i = 0; i < items.length; i++) {
      const current = items[i]!;
      const metaBase = (current.meta && typeof current.meta === "object" ? (current.meta as Record<string, unknown>) : {}) as Record<string, unknown>;
      const cmBase =
        metaBase._cm && typeof metaBase._cm === "object" ? (metaBase._cm as Record<string, unknown>) : ({} as Record<string, unknown>);
      const originIndex = typeof cmBase.originIndex === "number" ? (cmBase.originIndex as number) : undefined;

      const result = await workflows.runById({
        workflowId: ctx.config.workflowId,
        startAt: ctx.config.startAt,
        items: [current],
        parent: { runId: ctx.runId, workflowId: ctx.workflowId, nodeId: ctx.nodeId },
      });
      if (result.status !== "completed") throw new Error(`Subworkflow ${ctx.config.workflowId} did not complete (status=${result.status})`);
      for (const produced of result.outputs) {
        const childMetaBase =
          produced.meta && typeof produced.meta === "object" ? (produced.meta as Record<string, unknown>) : ({} as Record<string, unknown>);
        const childCmBase =
          childMetaBase._cm && typeof childMetaBase._cm === "object"
            ? (childMetaBase._cm as Record<string, unknown>)
            : ({} as Record<string, unknown>);

        out.push({
          ...produced,
          meta: originIndex === undefined ? childMetaBase : { ...childMetaBase, _cm: { ...childCmBase, originIndex } },
          paired: current.paired ?? produced.paired,
        });
      }
    }

    return { main: out };
  }
}

