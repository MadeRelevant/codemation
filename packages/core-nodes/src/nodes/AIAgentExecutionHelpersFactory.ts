import type { CredentialSessionService, Item, Items, NodeExecutionContext } from "@codemation/core";
import { injectable } from "@codemation/core";

import { DynamicStructuredTool } from "@langchain/core/tools";

import { ConnectionCredentialExecutionContextFactory } from "./ConnectionCredentialExecutionContextFactory";
import type { ResolvedTool } from "./aiAgentSupport.types";

/**
 * LangChain adapters and credential context wiring for {@link AIAgentNode}.
 * Lives in a `*Factory.ts` composition-root module so construction stays explicit and testable.
 */
@injectable()
export class AIAgentExecutionHelpersFactory {
  createConnectionCredentialExecutionContextFactory(
    credentialSessions: CredentialSessionService,
  ): ConnectionCredentialExecutionContextFactory {
    return new ConnectionCredentialExecutionContextFactory(credentialSessions);
  }

  createDynamicStructuredTool(
    entry: ResolvedTool,
    toolCredentialContext: NodeExecutionContext<any>,
    item: Item,
    itemIndex: number,
    items: Items,
  ): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: entry.config.name,
      description: entry.config.description ?? entry.runtime.defaultDescription,
      schema: entry.runtime.inputSchema,
      func: async (input) => {
        const result = await entry.runtime.execute({
          config: entry.config,
          input,
          ctx: toolCredentialContext,
          item,
          itemIndex,
          items,
        });
        return JSON.stringify(result);
      },
    });
  }
}
