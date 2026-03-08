import type { NodeConfigBase, NodeDefinition, NodeId, NodeRef, OutputPortKey, UpstreamRefPlaceholder, WorkflowDefinition, WorkflowId } from "./types";

type RunnableNodeConfig = NodeConfigBase & { kind: "node" };
type TriggerConfig = NodeConfigBase & { kind: "trigger" };

export class WorkflowBuilder {
  private readonly nodes: NodeDefinition[] = [];
  private readonly edges: WorkflowDefinition["edges"] = [];
  private seq = 0;

  constructor(private readonly meta: { id: WorkflowId; name: string }) {}

  private add(config: NodeConfigBase): NodeRef {
    const tokenName = typeof config.token === "function" ? (config.token as any).name : typeof config.token === "string" ? config.token : "Node";
    const id = config.id ?? `${tokenName}:${++this.seq}`;
    this.nodes.push({ id, kind: config.kind, token: config.token, name: config.name, config });
    return { id, kind: config.kind, name: config.name };
  }

  private connect(from: NodeRef, to: NodeRef, fromOutput: OutputPortKey = "main"): void {
    this.edges.push({ from: { nodeId: from.id, output: fromOutput }, to: { nodeId: to.id, input: "in" } });
  }

  trigger(config: TriggerConfig): ChainCursor {
    const ref = this.add(config);
    return new ChainCursor(this, ref, "main");
  }

  start(config: RunnableNodeConfig): ChainCursor {
    const ref = this.add(config);
    return new ChainCursor(this, ref, "main");
  }

  build(): WorkflowDefinition {
    return { ...this.meta, nodes: this.nodes, edges: this.edges };
  }
}

export class ChainCursor {
  constructor(private readonly wf: WorkflowBuilder, private readonly cursor: NodeRef, private readonly cursorOutput: OutputPortKey) {}

  then(config: RunnableNodeConfig): ChainCursor {
    const next = (this.wf as any).add(config) as NodeRef;
    (this.wf as any).connect(this.cursor, next, this.cursorOutput);
    return new ChainCursor(this.wf, next, "main");
  }

  when(branch: boolean, steps: RunnableNodeConfig[] | RunnableNodeConfig, ...more: RunnableNodeConfig[]): WhenBuilder {
    const list = Array.isArray(steps) ? steps : [steps, ...more];
    const port: OutputPortKey = branch ? "true" : "false";
    const b = new WhenBuilder(this.wf, this.cursor, port);
    b.addBranch(list);
    return b;
  }

  build(): WorkflowDefinition {
    return this.wf.build();
  }
}

export class WhenBuilder {
  constructor(private readonly wf: WorkflowBuilder, private readonly from: NodeRef, private readonly branchPort: OutputPortKey) {}

  addBranch(steps: RunnableNodeConfig[]): this {
    const created: NodeRef[] = [];

    let prev: NodeRef | null = null;
    for (const cfg of steps) {
      const ref = (this.wf as any).add(cfg) as NodeRef;
      created.push(ref);
      if (!prev) (this.wf as any).connect(this.from, ref, this.branchPort);
      else (this.wf as any).connect(prev, ref, "main");
      prev = ref;
    }

    // Generic placeholder resolution for configs that expose `upstreamRefs`.
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

  when(branch: boolean, steps: RunnableNodeConfig[] | RunnableNodeConfig, ...more: RunnableNodeConfig[]): WhenBuilder {
    const list = Array.isArray(steps) ? steps : [steps, ...more];
    const port: OutputPortKey = branch ? "true" : "false";
    const b = new WhenBuilder(this.wf, this.from, port);
    b.addBranch(list);
    return b;
  }

  build(): WorkflowDefinition {
    return this.wf.build();
  }
}

