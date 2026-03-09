import type {
  InputPortKey,
  NodeConfigBase,
  NodeDefinition,
  NodeId,
  NodeRef,
  OutputPortKey,
  UpstreamRefPlaceholder,
  WorkflowDefinition,
  WorkflowId,
} from "./types";

type RunnableNodeConfig = NodeConfigBase & { kind: "node" };
type TriggerConfig = NodeConfigBase & { kind: "trigger" };

export class WorkflowBuilder {
  private readonly nodes: NodeDefinition[] = [];
  private readonly edges: WorkflowDefinition["edges"] = [];
  private seq = 0;

  constructor(
    private readonly meta: { id: WorkflowId; name: string },
    private readonly options?: Readonly<{
      makeMergeNode?: (name: string) => RunnableNodeConfig;
    }>,
  ) {}

  private add(config: NodeConfigBase): NodeRef {
    const tokenName = typeof config.token === "function" ? (config.token as any).name : typeof config.token === "string" ? config.token : "Node";
    const id = config.id ?? `${tokenName}:${++this.seq}`;
    this.nodes.push({ id, kind: config.kind, token: config.token, name: config.name, config });
    return { id, kind: config.kind, name: config.name };
  }

  private connect(from: NodeRef, to: NodeRef, fromOutput: OutputPortKey = "main", toInput: InputPortKey = "in"): void {
    this.edges.push({ from: { nodeId: from.id, output: fromOutput }, to: { nodeId: to.id, input: toInput } });
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

  when(branch: boolean, steps: RunnableNodeConfig[] | RunnableNodeConfig, ...more: RunnableNodeConfig[]): WhenBuilder;
  when(branches: Readonly<{ true?: ReadonlyArray<RunnableNodeConfig>; false?: ReadonlyArray<RunnableNodeConfig> }>): ChainCursor;
  when(
    arg1: boolean | Readonly<{ true?: ReadonlyArray<RunnableNodeConfig>; false?: ReadonlyArray<RunnableNodeConfig> }>,
    steps?: RunnableNodeConfig[] | RunnableNodeConfig,
    ...more: RunnableNodeConfig[]
  ): WhenBuilder | ChainCursor {
    if (typeof arg1 === "boolean") {
      const list = Array.isArray(steps) ? steps : steps ? [steps, ...more] : more;
      const port: OutputPortKey = arg1 ? "true" : "false";
      const b = new WhenBuilder(this.wf, this.cursor, port);
      b.addBranch(list);
      return b;
    }

    const branches = arg1;
    const makeMerge = (this.wf as any).options?.makeMergeNode as ((name: string) => RunnableNodeConfig) | undefined;
    if (!makeMerge) {
      throw new Error(
        'WorkflowBuilder is missing options.makeMergeNode (required for when({true,false}). Use createWorkflowBuilder from "@codemation/core-nodes".',
      );
    }

    const wfAny = this.wf as any;

    const buildBranch = (
      port: OutputPortKey,
      branchSteps: ReadonlyArray<RunnableNodeConfig> | undefined,
    ): Readonly<{ end: NodeRef; endOutput: OutputPortKey }> => {
      const list = branchSteps ?? [];
      let prev: NodeRef | null = null;
      for (const cfg of list) {
        const ref = wfAny.add(cfg) as NodeRef;
        if (!prev) wfAny.connect(this.cursor, ref, port, "in");
        else wfAny.connect(prev, ref, "main", "in");
        prev = ref;
      }
      if (!prev) return { end: this.cursor, endOutput: port };
      return { end: prev, endOutput: "main" };
    };

    const t = buildBranch("true", branches.true);
    const f = buildBranch("false", branches.false);

    const merge = wfAny.add(makeMerge("Merge (auto)")) as NodeRef;
    // Connect both branches into merge with stable input names.
    wfAny.connect(t.end, merge, t.endOutput, "true");
    wfAny.connect(f.end, merge, f.endOutput, "false");

    return new ChainCursor(this.wf, merge, "main");
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
      if (!prev) (this.wf as any).connect(this.from, ref, this.branchPort, "in");
      else (this.wf as any).connect(prev, ref, "main", "in");
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

