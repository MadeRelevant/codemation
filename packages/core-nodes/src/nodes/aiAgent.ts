import type { Item, Items, Node, NodeConfigBase, NodeExecutionContext, NodeOutputs, TypeToken } from "@codemation/core";

export class AIAgent implements NodeConfigBase {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = AIAgentNode;
  constructor(
    public readonly name: string,
    public readonly cfg: {
      systemMessage: string;
      userMessageFormatter: (item: Item, index: number, items: Items, ctx: NodeExecutionContext<AIAgent>) => string;
      chatModel: { provider: string; model: string; options?: object };
      tools: Array<{ name: string; token: TypeToken<unknown>; inputSchema?: unknown }>;
    },
    public readonly id?: string,
  ) {}
}

export class AIAgentNode implements Node<AIAgent> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<AIAgent>): Promise<NodeOutputs> {
    const out: Item[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const msg = ctx.config.cfg.userMessageFormatter(item, i, items, ctx);
      const base = typeof item.json === "object" && item.json !== null ? (item.json as Record<string, unknown>) : {};
      // Pseudocode: this is where a LangChain pipeline would run.
      out.push({ json: { ...base, _agentPrompt: msg, _model: ctx.config.cfg.chatModel.model } });
    }
    return { main: out };
  }
}

