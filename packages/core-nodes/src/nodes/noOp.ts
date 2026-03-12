import type { Items, Node, NodeExecutionContext, NodeOutputs, RunnableNodeConfig, TypeToken } from "@codemation/core";
import { node } from "@codemation/core";

export class NoOp<TItemJson = unknown> implements RunnableNodeConfig<TItemJson, TItemJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = NoOpNode;
  readonly execution = { hint: "local" } as const;

  constructor(
    public readonly name: string = "NoOp",
    public readonly id?: string,
  ) {}
}

@node({ packageName: "@codemation/core-nodes" })
export class NoOpNode implements Node<NoOp<any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(items: Items, _ctx: NodeExecutionContext<NoOp<any>>): Promise<NodeOutputs> {
    return { main: items };
  }
}
