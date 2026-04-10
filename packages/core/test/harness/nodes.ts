import type {
  InputPortKey,
  Item,
  Items,
  MultiInputNode,
  NodeConfigBase,
  NodeExecutionContext,
  NodeOutputs,
  RetryPolicySpec,
  RunnableNode,
  RunnableNodeConfig,
  RunnableNodeExecuteArgs,
  TypeToken,
} from "../../src/index.ts";
import { emitPorts } from "../../src/index.ts";

export { SubWorkflowRunnerConfig, SubWorkflowRunnerNode } from "../../src/testing/SubWorkflowRunnerTestNode.ts";

export type CallbackExecuteArgs<TConfig extends NodeConfigBase> = Readonly<{
  items: Items;
  ctx: NodeExecutionContext<TConfig>;
}>;

export class CallbackNodeConfig<TItemJson = unknown> implements RunnableNodeConfig<TItemJson, TItemJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = CallbackNode;
  readonly emptyBatchExecution = "runOnce" as const;

  constructor(
    public readonly name: string,
    public readonly onExecute: (args: CallbackExecuteArgs<CallbackNodeConfig<TItemJson>>) => void,
    public readonly opts: Readonly<{
      id?: string;
      execution?: Readonly<{ hint?: "local" | "worker"; queue?: string }>;
      retryPolicy?: RetryPolicySpec;
      continueWhenEmptyOutput?: boolean;
    }> = {},
  ) {}

  get continueWhenEmptyOutput(): boolean | undefined {
    return this.opts.continueWhenEmptyOutput;
  }

  get id(): string | undefined {
    return this.opts.id;
  }

  get execution(): Readonly<{ hint?: "local" | "worker"; queue?: string }> | undefined {
    return this.opts.execution;
  }

  get retryPolicy(): RetryPolicySpec | undefined {
    return this.opts.retryPolicy;
  }
}

export class CallbackNode implements RunnableNode<CallbackNodeConfig<any>> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<CallbackNodeConfig<any>>): Promise<unknown> {
    const items = args.items ?? [];
    if (items.length === 0) {
      args.ctx.config.onExecute({ items, ctx: args.ctx });
      return emitPorts({ main: items });
    }
    if (args.itemIndex !== items.length - 1) {
      return [];
    }
    args.ctx.config.onExecute({ items, ctx: args.ctx });
    return emitPorts({ main: items });
  }
}

export class ThrowNodeConfig<TItemJson = unknown> implements RunnableNodeConfig<TItemJson, TItemJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = ThrowNode;

  constructor(
    public readonly name: string,
    public readonly errorOrFactory: Error | string | ((args: CallbackExecuteArgs<ThrowNodeConfig<TItemJson>>) => Error),
    public readonly opts: Readonly<{
      id?: string;
      execution?: Readonly<{ hint?: "local" | "worker"; queue?: string }>;
    }> = {},
  ) {}

  get id(): string | undefined {
    return this.opts.id;
  }

  get execution(): Readonly<{ hint?: "local" | "worker"; queue?: string }> | undefined {
    return this.opts.execution;
  }
}

export class ThrowNode implements RunnableNode<ThrowNodeConfig<any>> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<ThrowNodeConfig<any>>): Promise<unknown> {
    if (args.itemIndex === 0) {
      const v = args.ctx.config.errorOrFactory;
      if (typeof v === "function") throw v({ items: args.items, ctx: args.ctx });
      if (v instanceof Error) throw v;
      throw new Error(String(v ?? "ThrowNode error"));
    }
    return args.item;
  }
}

export class BranchNodeConfig<TItemJson = unknown> implements RunnableNodeConfig<TItemJson, TItemJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = BranchNode;

  constructor(
    public readonly name: string,
    public readonly decide: (
      item: Item<TItemJson>,
      ctx: NodeExecutionContext<BranchNodeConfig<TItemJson>>,
      index: number,
    ) => boolean | Promise<boolean>,
    public readonly opts: Readonly<{
      id?: string;
      execution?: Readonly<{ hint?: "local" | "worker"; queue?: string }>;
    }> = {},
  ) {}

  get id(): string | undefined {
    return this.opts.id;
  }

  get execution(): Readonly<{ hint?: "local" | "worker"; queue?: string }> | undefined {
    return this.opts.execution;
  }
}

function tagHarnessRouterItem(item: Item, itemIndex: number, nodeId: string): Item {
  const metaBase = (item.meta && typeof item.meta === "object" ? (item.meta as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;
  const cmBase =
    metaBase._cm && typeof metaBase._cm === "object"
      ? (metaBase._cm as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const originIndex = typeof cmBase.originIndex === "number" ? (cmBase.originIndex as number) : itemIndex;
  return {
    ...item,
    meta: { ...metaBase, _cm: { ...cmBase, originIndex } },
    paired: [{ nodeId, output: "$in", itemIndex: originIndex }, ...(item.paired ?? [])],
  };
}

export class BranchNode implements RunnableNode<BranchNodeConfig<any>> {
  readonly kind = "node" as const;
  readonly outputPorts = ["true", "false"] as const;

  async execute(args: RunnableNodeExecuteArgs<BranchNodeConfig<any>>): Promise<unknown> {
    const tagged = tagHarnessRouterItem(args.item, args.itemIndex, args.ctx.nodeId);
    const result = await args.ctx.config.decide(args.item, args.ctx, args.itemIndex);
    return emitPorts({
      true: result ? [tagged] : [],
      false: result ? [] : [tagged],
    });
  }
}

export class MapNodeConfig<TIn = unknown, TOut = unknown> implements RunnableNodeConfig<TIn, TOut> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = MapNode;

  constructor(
    public readonly name: string,
    public readonly map: (
      item: Item<TIn>,
      ctx: NodeExecutionContext<MapNodeConfig<TIn, TOut>>,
      index: number,
    ) => TOut | Promise<TOut>,
    public readonly opts: Readonly<{
      id?: string;
      execution?: Readonly<{ hint?: "local" | "worker"; queue?: string }>;
    }> = {},
  ) {}

  get id(): string | undefined {
    return this.opts.id;
  }

  get execution(): Readonly<{ hint?: "local" | "worker"; queue?: string }> | undefined {
    return this.opts.execution;
  }
}

export class MapNode implements RunnableNode<MapNodeConfig> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<MapNodeConfig>): Promise<unknown> {
    const json = await args.ctx.config.map(args.item as Item, args.ctx as never, args.itemIndex);
    return { json, meta: args.item.meta, paired: args.item.paired };
  }
}

export class IfNodeConfig<TItemJson = unknown> implements RunnableNodeConfig<TItemJson, TItemJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = IfNode;

  constructor(
    public readonly name: string,
    public readonly decide: (
      item: Item<TItemJson>,
      ctx: NodeExecutionContext<IfNodeConfig<TItemJson>>,
      index: number,
    ) => boolean | Promise<boolean>,
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

export class IfNode implements RunnableNode<IfNodeConfig<any>> {
  readonly kind = "node" as const;
  readonly outputPorts = ["true", "false"] as const;

  async execute(args: RunnableNodeExecuteArgs<IfNodeConfig<any>>): Promise<unknown> {
    const tagged = tagHarnessRouterItem(args.item, args.itemIndex, args.ctx.nodeId);
    const result = await args.ctx.config.decide(args.item, args.ctx, args.itemIndex);
    const yes = result ? [tagged] : [];
    const no = result ? [] : [tagged];
    const omit = args.ctx.config.omitUnusedOutputKey;
    const ports: Record<string, Items> = {};
    if (!omit || yes.length > 0) ports.true = yes;
    if (!omit || no.length > 0) ports.false = no;
    return emitPorts(ports);
  }
}

export class MergeNodeConfig<TInputJson = unknown, TOutputJson = TInputJson> implements RunnableNodeConfig<
  TInputJson,
  TOutputJson
> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = MergeNode;

  constructor(
    public readonly name: string,
    public readonly cfg: Readonly<{
      mode: "passThrough" | "append" | "mergeByPosition";
      prefer?: ReadonlyArray<InputPortKey>;
    }> = { mode: "passThrough" },
    public readonly opts: Readonly<{ id?: string }> = {},
  ) {}

  get id(): string | undefined {
    return this.opts.id;
  }
}

function orderedInputs(
  inputsByPort: Readonly<Record<InputPortKey, Items>>,
  prefer?: ReadonlyArray<InputPortKey>,
): InputPortKey[] {
  const keys = Object.keys(inputsByPort);
  const preferred = (prefer ?? []).filter((k) => keys.includes(k));
  const rest = keys.filter((k) => !preferred.includes(k)).sort();
  return [...preferred, ...rest];
}

export class MergeNode implements MultiInputNode<MergeNodeConfig<any, any>> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async executeMulti(
    inputsByPort: Readonly<Record<InputPortKey, Items>>,
    ctx: NodeExecutionContext<MergeNodeConfig<any, any>>,
  ): Promise<NodeOutputs> {
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
      const meta = item.meta as { _cm?: { originIndex?: unknown } } | undefined;
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
