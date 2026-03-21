import type { NodeId, NodeRef, OutputPortKey, UpstreamRefPlaceholder, WorkflowDefinition } from "../types";

import { WorkflowBuilder } from "./WorkflowBuilder";
import type { AnyRunnableNodeConfig, BooleanWhenOverloads, ValidStepSequence } from "./workflowBuilderTypes";

export class WhenBuilder<TCurrentJson> {
  constructor(private readonly wf: WorkflowBuilder, private readonly from: NodeRef, private readonly branchPort: OutputPortKey) {}

  addBranch<TSteps extends ReadonlyArray<AnyRunnableNodeConfig>>(steps: TSteps & ValidStepSequence<TCurrentJson, TSteps>): this {
    const created: NodeRef[] = [];

    let prev: NodeRef | null = null;
    for (const cfg of steps) {
      const ref = (this.wf as any).add(cfg) as NodeRef;
      created.push(ref);
      if (!prev) (this.wf as any).connect(this.from, ref, this.branchPort, "in");
      else (this.wf as any).connect(prev, ref, "main", "in");
      prev = ref;
    }

    for (const cfg of steps) {
      const maybe = cfg as unknown as { upstreamRefs?: Array<{ nodeId: NodeId } | UpstreamRefPlaceholder> };
      if (!Array.isArray(maybe.upstreamRefs) || maybe.upstreamRefs.length === 0) continue;

      maybe.upstreamRefs = maybe.upstreamRefs.map((r) => {
        if (typeof r !== "string") return r;
        const idx = parseInt(r.slice(1), 10);
        const nodeId = created[idx]?.id;
        return nodeId ? { nodeId } : { nodeId: r };
      });
    }

    return this;
  }

  readonly when: BooleanWhenOverloads<TCurrentJson, WhenBuilder<TCurrentJson>> = (
    branch: boolean,
    steps: ReadonlyArray<AnyRunnableNodeConfig> | AnyRunnableNodeConfig,
    ...more: AnyRunnableNodeConfig[]
  ): WhenBuilder<TCurrentJson> => {
    const list = Array.isArray(steps) ? steps : [steps, ...more];
    const port: OutputPortKey = branch ? "true" : "false";
    const b = new WhenBuilder<TCurrentJson>(this.wf, this.from, port);
    b.addBranch(list);
    return b;
  };

  build(): WorkflowDefinition {
    return this.wf.build();
  }
}

