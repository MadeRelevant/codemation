import type { TypeToken } from "../di";
import type {
  Item,
  Items,
  NodeExecutionContext,
  RunnableNode,
  RunnableNodeConfig,
  RunnableNodeExecuteArgs,
} from "../types";
import { emitPorts } from "../contracts/emitPorts";

export class SwitchHarnessNode implements RunnableNode<SwitchHarnessNodeConfig<any>> {
  readonly kind = "node" as const;
  readonly outputPorts = [] as const;

  async execute(args: RunnableNodeExecuteArgs<SwitchHarnessNodeConfig<any>>): Promise<unknown> {
    const key = await Promise.resolve(
      args.ctx.config.cfg.resolveCaseKey(args.item as Item, args.itemIndex, args.items, args.ctx),
    );
    const { cases, defaultCase } = args.ctx.config.cfg;
    const port = cases.includes(key) ? key : defaultCase;
    return emitPorts({
      [port]: [args.item],
    });
  }
}

export class SwitchHarnessNodeConfig<TInputJson = unknown> implements RunnableNodeConfig<TInputJson, TInputJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = SwitchHarnessNode;
  readonly lineageCarry = "carryThrough" as const;
  readonly declaredOutputPorts: ReadonlyArray<string>;

  constructor(
    public readonly name: string,
    public readonly cfg: Readonly<{
      cases: readonly string[];
      defaultCase: string;
      resolveCaseKey: (
        item: Item<TInputJson>,
        index: number,
        items: Items<TInputJson>,
        ctx: NodeExecutionContext<SwitchHarnessNodeConfig<TInputJson>>,
      ) => string | Promise<string>;
    }>,
    public readonly opts: Readonly<{ id?: string }> = {},
  ) {
    this.declaredOutputPorts = [...new Set([...cfg.cases, cfg.defaultCase])].sort();
  }

  get id(): string | undefined {
    return this.opts.id;
  }
}
