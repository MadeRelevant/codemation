import type {
Item,
Items,
Node,
NodeExecutionContext,
NodeOutputs,
WorkflowRunnerService
} from "@codemation/core";

import { CoreTokens,inject,node } from "@codemation/core";

import { SubWorkflow } from "./subWorkflow";



@node({ packageName: "@codemation/core-nodes" })
export class SubWorkflowNode implements Node<SubWorkflow<any, any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  constructor(
    @inject(CoreTokens.WorkflowRunnerService)
    private readonly workflows: WorkflowRunnerService,
  ) {}

  async execute(items: Items, ctx: NodeExecutionContext<SubWorkflow<any, any>>): Promise<NodeOutputs> {
    const out: Item[] = [];
    for (let i = 0; i < items.length; i++) {
      const current = items[i]!;
      const metaBase = (current.meta && typeof current.meta === "object" ? (current.meta as Record<string, unknown>) : {}) as Record<string, unknown>;
      const cmBase =
        metaBase._cm && typeof metaBase._cm === "object" ? (metaBase._cm as Record<string, unknown>) : ({} as Record<string, unknown>);
      const originIndex = typeof cmBase.originIndex === "number" ? (cmBase.originIndex as number) : undefined;

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
