import type { Item, RunnableNode, RunnableNodeExecuteArgs, WorkflowRunnerService } from "@codemation/core";
import { CoreTokens, emitPorts, inject, node } from "@codemation/core";

import { SubWorkflow } from "./subWorkflow";

@node({ packageName: "@codemation/core-nodes" })
export class SubWorkflowNode implements RunnableNode<SubWorkflow<any, any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  constructor(
    @inject(CoreTokens.WorkflowRunnerService)
    private readonly workflows: WorkflowRunnerService,
  ) {}

  async execute(args: RunnableNodeExecuteArgs<SubWorkflow<any, any>>): Promise<unknown> {
    const current = args.item as Item;
    const metaBase = (
      current.meta && typeof current.meta === "object" ? (current.meta as Record<string, unknown>) : {}
    ) as Record<string, unknown>;
    const cmBase =
      metaBase._cm && typeof metaBase._cm === "object"
        ? (metaBase._cm as Record<string, unknown>)
        : ({} as Record<string, unknown>);
    const originIndex = typeof cmBase.originIndex === "number" ? (cmBase.originIndex as number) : undefined;

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
    const out: Item[] = [];
    for (const produced of result.outputs) {
      const childMetaBase =
        produced.meta && typeof produced.meta === "object"
          ? (produced.meta as Record<string, unknown>)
          : ({} as Record<string, unknown>);
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

    return emitPorts({ main: out });
  }
}
