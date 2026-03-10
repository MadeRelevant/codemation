import type { Items, Node, NodeConfigBase, NodeExecutionContext, NodeOutputs, TypeToken } from "@codemation/core";

export class Wait implements NodeConfigBase {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = WaitNode;
  readonly execution = { hint: "local" } as const;

  constructor(
    public readonly name: string,
    public readonly milliseconds: number,
    public readonly id?: string,
  ) {}
}

class WaitDuration {
  static normalize(milliseconds: number): number {
    return Number.isFinite(milliseconds) && milliseconds > 0 ? Math.floor(milliseconds) : 0;
  }
}

export class WaitNode implements Node<Wait> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<Wait>): Promise<NodeOutputs> {
    const milliseconds = WaitDuration.normalize(ctx.config.milliseconds);
    if (milliseconds > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, milliseconds);
      });
    }
    return { main: items };
  }
}
