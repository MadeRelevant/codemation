import type { Items, Node, NodeExecutionContext, NodeOutputs, RunnableNodeConfig, TypeToken } from "@codemation/core";

export class NoOp<TItemJson = unknown> implements RunnableNodeConfig<TItemJson, TItemJson> {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = NoOpNode;
  readonly tokenId = "codemation.core-nodes.no-op";
  readonly execution = { hint: "local" } as const;

  constructor(
    public readonly name: string = "NoOp",
    public readonly id?: string,
  ) {}
}

export class NoOpNode implements Node<NoOp<any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(items: Items, _ctx: NodeExecutionContext<NoOp<any>>): Promise<NodeOutputs> {
    return { main: items };
  }
}
