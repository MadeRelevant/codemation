import type {
  InputPortKey,
  NodeConfigBase,
  NodeDefinition,
  NodeId,
  NodeRef,
  OutputPortKey,
  RunnableNodeConfig,
  RunnableNodeOutputJson,
  TriggerNodeConfig,
  TriggerNodeOutputJson,
  UpstreamRefPlaceholder,
  WorkflowDefinition,
  WorkflowId,
} from "./types";

type AnyRunnableNodeConfig = RunnableNodeConfig<any, any>;
type AnyTriggerNodeConfig = TriggerNodeConfig<any>;

type ValidStepSequence<TCurrentJson, TSteps extends ReadonlyArray<AnyRunnableNodeConfig>> =
  TSteps extends readonly []
    ? readonly []
    : TSteps extends readonly [infer TFirst, ...infer TRest]
      ? TFirst extends RunnableNodeConfig<TCurrentJson, infer TNextJson>
        ? TRest extends ReadonlyArray<AnyRunnableNodeConfig>
          ? readonly [TFirst, ...ValidStepSequence<TNextJson, TRest>]
          : never
        : never
      : TSteps;

type StepSequenceOutput<TCurrentJson, TSteps extends ReadonlyArray<AnyRunnableNodeConfig> | undefined> =
  TSteps extends ReadonlyArray<AnyRunnableNodeConfig>
    ? TSteps extends readonly []
      ? TCurrentJson
      : TSteps extends readonly [infer TFirst, ...infer TRest]
        ? TFirst extends RunnableNodeConfig<TCurrentJson, infer TNextJson>
          ? TRest extends ReadonlyArray<AnyRunnableNodeConfig>
            ? StepSequenceOutput<TNextJson, TRest>
            : never
          : never
        : TCurrentJson
    : TCurrentJson;

type TypesMatch<TLeft, TRight> = [TLeft] extends [TRight] ? ([TRight] extends [TLeft] ? true : false) : false;

type BranchOutputGuard<
  TCurrentJson,
  TTrueSteps extends ReadonlyArray<AnyRunnableNodeConfig> | undefined,
  TFalseSteps extends ReadonlyArray<AnyRunnableNodeConfig> | undefined,
> =
  TypesMatch<StepSequenceOutput<TCurrentJson, TTrueSteps>, StepSequenceOutput<TCurrentJson, TFalseSteps>> extends true ? unknown : never;

export class WorkflowBuilder {
  private readonly nodes: NodeDefinition[] = [];
  private readonly edges: WorkflowDefinition["edges"] = [];
  private seq = 0;

  constructor(
    private readonly meta: { id: WorkflowId; name: string },
    private readonly options?: Readonly<{
      makeMergeNode?: (name: string) => AnyRunnableNodeConfig;
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

  trigger<TConfig extends AnyTriggerNodeConfig>(config: TConfig): ChainCursor<TriggerNodeOutputJson<TConfig>> {
    const ref = this.add(config);
    return new ChainCursor<TriggerNodeOutputJson<TConfig>>(this, ref, "main");
  }

  start<TConfig extends AnyRunnableNodeConfig>(config: TConfig): ChainCursor<RunnableNodeOutputJson<TConfig>> {
    const ref = this.add(config);
    return new ChainCursor<RunnableNodeOutputJson<TConfig>>(this, ref, "main");
  }

  build(): WorkflowDefinition {
    return { ...this.meta, nodes: this.nodes, edges: this.edges };
  }
}

export class ChainCursor<TCurrentJson> {
  constructor(private readonly wf: WorkflowBuilder, private readonly cursor: NodeRef, private readonly cursorOutput: OutputPortKey) {}

  then<TConfig extends RunnableNodeConfig<TCurrentJson, any>>(config: TConfig): ChainCursor<RunnableNodeOutputJson<TConfig>> {
    const next = (this.wf as any).add(config) as NodeRef;
    (this.wf as any).connect(this.cursor, next, this.cursorOutput);
    return new ChainCursor<RunnableNodeOutputJson<TConfig>>(this.wf, next, "main");
  }

  when<TSteps extends ReadonlyArray<AnyRunnableNodeConfig>>(
    branch: boolean,
    steps: TSteps & ValidStepSequence<TCurrentJson, TSteps>,
  ): WhenBuilder<TCurrentJson>;
  when<TFirstStep extends RunnableNodeConfig<TCurrentJson, any>, TRestSteps extends ReadonlyArray<AnyRunnableNodeConfig>>(
    branch: boolean,
    step: TFirstStep,
    ...more: TRestSteps & ValidStepSequence<RunnableNodeOutputJson<TFirstStep>, TRestSteps>
  ): WhenBuilder<TCurrentJson>;
  when<
    TTrueSteps extends ReadonlyArray<AnyRunnableNodeConfig> | undefined,
    TFalseSteps extends ReadonlyArray<AnyRunnableNodeConfig> | undefined,
  >(
    branches: Readonly<{
      true?: TTrueSteps extends ReadonlyArray<AnyRunnableNodeConfig> ? TTrueSteps & ValidStepSequence<TCurrentJson, TTrueSteps> : never;
      false?: TFalseSteps extends ReadonlyArray<AnyRunnableNodeConfig> ? TFalseSteps & ValidStepSequence<TCurrentJson, TFalseSteps> : never;
    }> &
      BranchOutputGuard<TCurrentJson, TTrueSteps, TFalseSteps>,
  ): ChainCursor<StepSequenceOutput<TCurrentJson, TTrueSteps>>;
  when(
    arg1: boolean | Readonly<{ true?: ReadonlyArray<AnyRunnableNodeConfig>; false?: ReadonlyArray<AnyRunnableNodeConfig> }>,
    steps?: ReadonlyArray<AnyRunnableNodeConfig> | AnyRunnableNodeConfig,
    ...more: AnyRunnableNodeConfig[]
  ): WhenBuilder<TCurrentJson> | ChainCursor<TCurrentJson> {
    if (typeof arg1 === "boolean") {
      const list = Array.isArray(steps) ? steps : steps ? [steps, ...more] : more;
      const port: OutputPortKey = arg1 ? "true" : "false";
      const b = new WhenBuilder<TCurrentJson>(this.wf, this.cursor, port);
      b.addBranch(list);
      return b;
    }

    const branches = arg1;
    const makeMerge = (this.wf as any).options?.makeMergeNode as ((name: string) => AnyRunnableNodeConfig) | undefined;
    if (!makeMerge) {
      throw new Error(
        'WorkflowBuilder is missing options.makeMergeNode (required for when({true,false}). Use createWorkflowBuilder from "@codemation/core-nodes".',
      );
    }

    const wfAny = this.wf as any;

    const buildBranch = (
      port: OutputPortKey,
      branchSteps: ReadonlyArray<AnyRunnableNodeConfig> | undefined,
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

    return new ChainCursor<TCurrentJson>(this.wf, merge, "main");
  }

  build(): WorkflowDefinition {
    return this.wf.build();
  }
}

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

  when<TSteps extends ReadonlyArray<AnyRunnableNodeConfig>>(
    branch: boolean,
    steps: TSteps & ValidStepSequence<TCurrentJson, TSteps>,
  ): WhenBuilder<TCurrentJson>;
  when<TFirstStep extends RunnableNodeConfig<TCurrentJson, any>, TRestSteps extends ReadonlyArray<AnyRunnableNodeConfig>>(
    branch: boolean,
    step: TFirstStep,
    ...more: TRestSteps & ValidStepSequence<RunnableNodeOutputJson<TFirstStep>, TRestSteps>
  ): WhenBuilder<TCurrentJson>;
  when(
    branch: boolean,
    steps: ReadonlyArray<AnyRunnableNodeConfig> | AnyRunnableNodeConfig,
    ...more: AnyRunnableNodeConfig[]
  ): WhenBuilder<TCurrentJson> {
    const list = Array.isArray(steps) ? steps : [steps, ...more];
    const port: OutputPortKey = branch ? "true" : "false";
    const b = new WhenBuilder<TCurrentJson>(this.wf, this.from, port);
    b.addBranch(list);
    return b;
  }

  build(): WorkflowDefinition {
    return this.wf.build();
  }
}

