import type {
  AgentTool,
  AgentToolToken,
  ChatModelConfig,
  Item,
  Items,
  Node,
  NodeConfigBase,
  NodeExecutionContext,
  NodeOutputs,
  TypeToken,
} from "@codemation/core";
import { resolveCredential } from "@codemation/core";

export class AIAgent implements NodeConfigBase {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = AIAgentNode;
  constructor(
    public readonly name: string,
    public readonly cfg: {
      systemMessage: string;
      userMessageFormatter: (item: Item, index: number, items: Items, ctx: NodeExecutionContext<AIAgent>) => string;
      chatModel: ChatModelConfig;
      /**
       * Tool implementations are referenced by DI token (usually class tokens).
       */
      tools?: ReadonlyArray<AgentToolToken>;
    },
    public readonly id?: string,
  ) {}
}

export class AIAgentNode implements Node<AIAgent> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<AIAgent>): Promise<NodeOutputs> {
    const container = ctx.services.container;
    const toolTokens = ctx.config.cfg.tools ?? [];
    if (toolTokens.length > 0 && !container) {
      throw new Error(`AIAgent requires ctx.services.container to resolve tools (missing container)`);
    }

    // Resolve tool instances up-front so they can be used by a future model loop.
    // (We don't trigger tool calls here; tools are only "available".)
    void toolTokens.map((t) => container!.resolve(t) as AgentTool);

    // Resolve credentials early (fail fast) if configured.
    if (ctx.config.cfg.chatModel.provider === "openai" && ctx.config.cfg.chatModel.options?.apiKey) {
      await resolveCredential(ctx.config.cfg.chatModel.options.apiKey, ctx.services.credentials);
    }

    const out: Item[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const msg = ctx.config.cfg.userMessageFormatter(item, i, items, ctx);
      const base = typeof item.json === "object" && item.json !== null ? (item.json as Record<string, unknown>) : {};

      // Pseudocode: this is where a real agent loop / model call would run.
      out.push({
        ...item,
        json: {
          ...base,
          _agentPrompt: msg,
          _model: ctx.config.cfg.chatModel.model,
        },
      });
    }
    return { main: out };
  }
}

