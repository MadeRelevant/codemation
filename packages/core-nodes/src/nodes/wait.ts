import type { Items, Node, NodeExecutionContext, NodeOutputs, RunnableNodeConfig, TypeToken } from "@codemation/core";
import { node } from "@codemation/core";

export class Wait<TItemJson = unknown> implements RunnableNodeConfig<TItemJson, TItemJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = WaitNode;
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

@node({ packageName: "@codemation/core-nodes" })
export class WaitNode implements Node<Wait<any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<Wait<any>>): Promise<NodeOutputs> {
    const milliseconds = WaitDuration.normalize(ctx.config.milliseconds);
    if (milliseconds > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, milliseconds);
      });
    }
    return { main: items };
  }
}
