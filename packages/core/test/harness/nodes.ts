import type {
  Item,
  InputPortKey,
  Items,
  MultiInputNode,
  Node,
  NodeConfigBase,
  NodeExecutionContext,
  NodeOutputs,
  RunnableNodeConfig,
  TriggerNodeConfig,
  TypeToken,
  WorkflowId,
  NodeId,
} from "../../dist/index.js";

export type CallbackExecuteArgs<TConfig extends NodeConfigBase> = Readonly<{
  items: Items;
  ctx: NodeExecutionContext<TConfig>;
}>;

export class CallbackNodeConfig<TItemJson = unknown> implements RunnableNodeConfig<TItemJson, TItemJson> {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = CallbackNode;

  constructor(
    public readonly name: string,
    public readonly onExecute: (args: CallbackExecuteArgs<CallbackNodeConfig<TItemJson>>) => void,
    public readonly opts: Readonly<{ id?: string; execution?: Readonly<{ hint?: "local" | "worker"; queue?: string }> }> = {},
  ) {}

  get id(): string | undefined {
    return this.opts.id;
  }

  get execution(): Readonly<{ hint?: "local" | "worker"; queue?: string }> | undefined {
    return this.opts.execution;
  }
}

export class CallbackNode implements Node<CallbackNodeConfig<any>> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<CallbackNodeConfig<any>>): Promise<NodeOutputs> {
    ctx.config.onExecute({ items, ctx });
    return { main: items };
  }
}

export class ThrowNodeConfig<TItemJson = unknown> implements RunnableNodeConfig<TItemJson, TItemJson> {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = ThrowNode;

  constructor(
    public readonly name: string,
    public readonly errorOrFactory:
      | Error
      | string
      | ((args: CallbackExecuteArgs<ThrowNodeConfig<TItemJson>>) => Error),
    public readonly opts: Readonly<{ id?: string; execution?: Readonly<{ hint?: "local" | "worker"; queue?: string }> }> = {},
  ) {}

  get id(): string | undefined {
    return this.opts.id;
  }

  get execution(): Readonly<{ hint?: "local" | "worker"; queue?: string }> | undefined {
    return this.opts.execution;
  }
}

export class ThrowNode implements Node<ThrowNodeConfig<any>> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<ThrowNodeConfig<any>>): Promise<NodeOutputs> {
    const v = ctx.config.errorOrFactory;
    if (typeof v === "function") throw v({ items, ctx });
    if (v instanceof Error) throw v;
    throw new Error(String(v ?? "ThrowNode error"));
  }
}

export class BranchNodeConfig<TItemJson = unknown> implements RunnableNodeConfig<TItemJson, TItemJson> {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = BranchNode;

  constructor(
    public readonly name: string,
    public readonly decide: (item: Item<TItemJson>, ctx: NodeExecutionContext<BranchNodeConfig<TItemJson>>, index: number) => boolean | Promise<boolean>,
    public readonly opts: Readonly<{ id?: string; execution?: Readonly<{ hint?: "local" | "worker"; queue?: string }> }> = {},
  ) {}

  get id(): string | undefined {
    return this.opts.id;
  }

  get execution(): Readonly<{ hint?: "local" | "worker"; queue?: string }> | undefined {
    return this.opts.execution;
  }
}

export class BranchNode implements Node<BranchNodeConfig<any>> {
  readonly kind = "node" as const;
  readonly outputPorts = ["true", "false"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<BranchNodeConfig<any>>): Promise<NodeOutputs> {
    const yes: Item[] = [];
    const no: Item[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const metaBase = (item.meta && typeof item.meta === "object" ? (item.meta as Record<string, unknown>) : {}) as Record<string, unknown>;
      const cmBase =
        metaBase._cm && typeof metaBase._cm === "object" ? (metaBase._cm as Record<string, unknown>) : ({} as Record<string, unknown>);
      const originIndex = typeof cmBase.originIndex === "number" ? (cmBase.originIndex as number) : i;
      const tagged: Item = {
        ...item,
        meta: { ...metaBase, _cm: { ...cmBase, originIndex } },
        paired: [{ nodeId: ctx.nodeId, output: "$in", itemIndex: originIndex }, ...(item.paired ?? [])],
      };
      const result = await ctx.config.decide(item, ctx, i);
      if (result) yes.push(tagged);
      else no.push(tagged);
    }

    return { true: yes, false: no } as unknown as NodeOutputs;
  }
}

export class MapNodeConfig<TIn = unknown, TOut = unknown> implements RunnableNodeConfig<TIn, TOut> {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = MapNode;

  constructor(
    public readonly name: string,
    public readonly map: (item: Item<TIn>, ctx: NodeExecutionContext<MapNodeConfig<TIn, TOut>>, index: number) => TOut | Promise<TOut>,
    public readonly opts: Readonly<{ id?: string; execution?: Readonly<{ hint?: "local" | "worker"; queue?: string }> }> = {},
  ) {}

  get id(): string | undefined {
    return this.opts.id;
  }

  get execution(): Readonly<{ hint?: "local" | "worker"; queue?: string }> | undefined {
    return this.opts.execution;
  }
}

export class MapNode implements Node<MapNodeConfig> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<MapNodeConfig>): Promise<NodeOutputs> {
    const out: Item[] = [];
    for (let i = 0; i < items.length; i++) {
      const current = items[i]!;
      const json = await ctx.config.map(current as any, ctx as any, i);
      out.push({ json, meta: current.meta, paired: current.paired });
    }
    return { main: out };
  }
}

export class IfNodeConfig<TItemJson = unknown> implements RunnableNodeConfig<TItemJson, TItemJson> {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = IfNode;

  constructor(
    public readonly name: string,
    public readonly decide: (item: Item<TItemJson>, ctx: NodeExecutionContext<IfNodeConfig<TItemJson>>, index: number) => boolean | Promise<boolean>,
    public readonly opts: Readonly<{
      id?: string;
      omitUnusedOutputKey?: boolean;
      execution?: Readonly<{ hint?: "local" | "worker"; queue?: string }>;
    }> = {},
  ) {}

  get id(): string | undefined {
    return this.opts.id;
  }

  get execution(): Readonly<{ hint?: "local" | "worker"; queue?: string }> | undefined {
    return this.opts.execution;
  }

  get omitUnusedOutputKey(): boolean {
    return this.opts.omitUnusedOutputKey ?? true;
  }
}

export class IfNode implements Node<IfNodeConfig<any>> {
  readonly kind = "node" as const;
  readonly outputPorts = ["true", "false"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<IfNodeConfig<any>>): Promise<NodeOutputs> {
    const yes: Item[] = [];
    const no: Item[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const metaBase = (item.meta && typeof item.meta === "object" ? (item.meta as Record<string, unknown>) : {}) as Record<string, unknown>;
      const cmBase =
        metaBase._cm && typeof metaBase._cm === "object" ? (metaBase._cm as Record<string, unknown>) : ({} as Record<string, unknown>);
      const originIndex = typeof cmBase.originIndex === "number" ? (cmBase.originIndex as number) : i;
      const tagged: Item = {
        ...item,
        meta: { ...metaBase, _cm: { ...cmBase, originIndex } },
        paired: [{ nodeId: ctx.nodeId, output: "$in", itemIndex: originIndex }, ...(item.paired ?? [])],
      };
      const result = await ctx.config.decide(item, ctx, i);
      if (result) yes.push(tagged);
      else no.push(tagged);
    }

    const omit = ctx.config.omitUnusedOutputKey;
    const out: Record<string, Items> = {};
    if (!omit || yes.length > 0) out.true = yes;
    if (!omit || no.length > 0) out.false = no;
    return out as unknown as NodeOutputs;
  }
}

export class SubWorkflowRunnerConfig<TInputJson = unknown, TOutputJson = unknown> implements RunnableNodeConfig<TInputJson, TOutputJson> {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = SubWorkflowRunnerNode;

  constructor(
    public readonly name: string,
    public readonly args: Readonly<{ workflowId: WorkflowId; startAt?: NodeId; id?: string; execution?: Readonly<{ hint?: "local" | "worker"; queue?: string }> }>,
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

  async execute(items: Items, ctx: NodeExecutionContext<SubWorkflowRunnerConfig<any, any>>): Promise<NodeOutputs> {
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
      if (result.status !== "completed") {
        throw new Error(`Subworkflow ${ctx.config.workflowId} did not complete (status=${result.status})`);
      }
      out.push(...result.outputs);
    }

    return { main: out };
  }
}

export class MergeNodeConfig<TInputJson = unknown, TOutputJson = TInputJson> implements RunnableNodeConfig<TInputJson, TOutputJson> {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = MergeNode;

  constructor(
    public readonly name: string,
    public readonly cfg: Readonly<{ mode: "passThrough" | "append" | "mergeByPosition"; prefer?: ReadonlyArray<InputPortKey> }> = { mode: "passThrough" },
    public readonly opts: Readonly<{ id?: string }> = {},
  ) {}

  get id(): string | undefined {
    return this.opts.id;
  }
}

function orderedInputs(inputsByPort: Readonly<Record<InputPortKey, Items>>, prefer?: ReadonlyArray<InputPortKey>): InputPortKey[] {
  const keys = Object.keys(inputsByPort);
  const preferred = (prefer ?? []).filter((k) => keys.includes(k));
  const rest = keys.filter((k) => !preferred.includes(k)).sort();
  return [...preferred, ...rest];
}

export class MergeNode implements MultiInputNode<MergeNodeConfig<any, any>> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async executeMulti(inputsByPort: Readonly<Record<InputPortKey, Items>>, ctx: NodeExecutionContext<MergeNodeConfig<any, any>>): Promise<NodeOutputs> {
    const order = orderedInputs(inputsByPort, ctx.config.cfg.prefer);

    if (ctx.config.cfg.mode === "append") {
      const out: Item[] = [];
      for (const k of order) out.push(...(inputsByPort[k] ?? []));
      return { main: out };
    }

    if (ctx.config.cfg.mode === "mergeByPosition") {
      let maxLen = 0;
      for (const k of order) maxLen = Math.max(maxLen, (inputsByPort[k] ?? []).length);

      const out: Item[] = [];
      for (let i = 0; i < maxLen; i++) {
        const json: Record<string, unknown> = {};
        for (const k of order) json[k] = (inputsByPort[k] ?? [])[i]?.json;
        out.push({ json });
      }
      return { main: out };
    }

    // passThrough: deterministic input precedence per originIndex (aligns branch outputs).
    const chosenByOrigin = new Map<number, Item>();
    const fallback: Item[] = [];

    const getOriginIndex = (item: Item): number | undefined => {
      const meta = item.meta as any;
      const v = meta?._cm?.originIndex;
      return typeof v === "number" && Number.isFinite(v) ? v : undefined;
    };

    for (const k of order) {
      for (const item of inputsByPort[k] ?? []) {
        const origin = getOriginIndex(item);
        if (origin === undefined) {
          fallback.push(item);
          continue;
        }
        if (!chosenByOrigin.has(origin)) chosenByOrigin.set(origin, item);
      }
    }

    const out: Item[] = [];
    const origins = Array.from(chosenByOrigin.keys()).sort((a, b) => a - b);
    for (const o of origins) out.push(chosenByOrigin.get(o)!);
    out.push(...fallback);
    return { main: out };
  }
}

