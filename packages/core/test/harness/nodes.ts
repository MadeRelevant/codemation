import type {
  Item,
  Items,
  Node,
  NodeConfigBase,
  NodeExecutionContext,
  NodeOutputs,
  TypeToken,
  WorkflowId,
  NodeId,
} from "../../dist/index.js";

export type CallbackExecuteArgs<TConfig extends NodeConfigBase> = Readonly<{
  items: Items;
  ctx: NodeExecutionContext<TConfig>;
}>;

export class CallbackNodeConfig implements NodeConfigBase {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = CallbackNode;

  constructor(
    public readonly name: string,
    public readonly onExecute: (args: CallbackExecuteArgs<CallbackNodeConfig>) => void,
    public readonly opts: Readonly<{ id?: string; execution?: Readonly<{ hint?: "local" | "worker"; queue?: string }> }> = {},
  ) {}

  get id(): string | undefined {
    return this.opts.id;
  }

  get execution(): Readonly<{ hint?: "local" | "worker"; queue?: string }> | undefined {
    return this.opts.execution;
  }
}

export class CallbackNode implements Node<CallbackNodeConfig> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<CallbackNodeConfig>): Promise<NodeOutputs> {
    ctx.config.onExecute({ items, ctx });
    return { main: items };
  }
}

export class ThrowNodeConfig implements NodeConfigBase {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = ThrowNode;

  constructor(
    public readonly name: string,
    public readonly errorOrFactory:
      | Error
      | string
      | ((args: CallbackExecuteArgs<ThrowNodeConfig>) => Error),
    public readonly opts: Readonly<{ id?: string; execution?: Readonly<{ hint?: "local" | "worker"; queue?: string }> }> = {},
  ) {}

  get id(): string | undefined {
    return this.opts.id;
  }

  get execution(): Readonly<{ hint?: "local" | "worker"; queue?: string }> | undefined {
    return this.opts.execution;
  }
}

export class ThrowNode implements Node<ThrowNodeConfig> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<ThrowNodeConfig>): Promise<NodeOutputs> {
    const v = ctx.config.errorOrFactory;
    if (typeof v === "function") throw v({ items, ctx });
    if (v instanceof Error) throw v;
    throw new Error(String(v ?? "ThrowNode error"));
  }
}

export class BranchNodeConfig implements NodeConfigBase {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = BranchNode;

  constructor(
    public readonly name: string,
    public readonly decide: (item: Item, ctx: NodeExecutionContext<BranchNodeConfig>, index: number) => boolean | Promise<boolean>,
    public readonly opts: Readonly<{ id?: string; execution?: Readonly<{ hint?: "local" | "worker"; queue?: string }> }> = {},
  ) {}

  get id(): string | undefined {
    return this.opts.id;
  }

  get execution(): Readonly<{ hint?: "local" | "worker"; queue?: string }> | undefined {
    return this.opts.execution;
  }
}

export class BranchNode implements Node<BranchNodeConfig> {
  readonly kind = "node" as const;
  readonly outputPorts = ["true", "false"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<BranchNodeConfig>): Promise<NodeOutputs> {
    const yes: Item[] = [];
    const no: Item[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const result = await ctx.config.decide(item, ctx, i);
      if (result) yes.push(item);
      else no.push(item);
    }

    return { true: yes, false: no } as unknown as NodeOutputs;
  }
}

export class MapNodeConfig<TIn = unknown, TOut = unknown> implements NodeConfigBase {
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

export class IfNodeConfig implements NodeConfigBase {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = IfNode;

  constructor(
    public readonly name: string,
    public readonly decide: (item: Item, ctx: NodeExecutionContext<IfNodeConfig>, index: number) => boolean | Promise<boolean>,
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

export class IfNode implements Node<IfNodeConfig> {
  readonly kind = "node" as const;
  readonly outputPorts = ["true", "false"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<IfNodeConfig>): Promise<NodeOutputs> {
    const yes: Item[] = [];
    const no: Item[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const result = await ctx.config.decide(item, ctx, i);
      if (result) yes.push(item);
      else no.push(item);
    }

    const omit = ctx.config.omitUnusedOutputKey;
    const out: Record<string, Items> = {};
    if (!omit || yes.length > 0) out.true = yes;
    if (!omit || no.length > 0) out.false = no;
    return out as unknown as NodeOutputs;
  }
}

export class SubWorkflowRunnerConfig implements NodeConfigBase {
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

export class SubWorkflowRunnerNode implements Node<SubWorkflowRunnerConfig> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<SubWorkflowRunnerConfig>): Promise<NodeOutputs> {
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

