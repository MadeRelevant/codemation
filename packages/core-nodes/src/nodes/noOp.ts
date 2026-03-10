import type { Items, Node, NodeConfigBase, NodeExecutionContext, NodeOutputs, TypeToken } from "@codemation/core";

export class NoOp implements NodeConfigBase {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = NoOpNode;
  readonly execution = { hint: "local" } as const;

  constructor(
    public readonly name: string = "NoOp",
    public readonly id?: string,
  ) {}
}

export class NoOpNode implements Node<NoOp> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(items: Items, _ctx: NodeExecutionContext<NoOp>): Promise<NodeOutputs> {
    return { main: items };
  }
}
