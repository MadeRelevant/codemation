import { injectable } from "@codemation/core";
import { experimental_createMCPClient } from "@ai-sdk/mcp";
import type { MCPClient } from "@ai-sdk/mcp";

export type McpClientOpenArgs = Readonly<{
  url: string;
  headers: Record<string, string>;
}>;

export interface McpClientFactory {
  open(args: McpClientOpenArgs): Promise<MCPClient>;
}

/**
 * Default implementation — delegates to @ai-sdk/mcp's experimental_createMCPClient
 * using the streamable HTTP transport.
 */
@injectable()
export class DefaultMcpClientFactory implements McpClientFactory {
  async open(args: McpClientOpenArgs): Promise<MCPClient> {
    return experimental_createMCPClient({
      transport: {
        type: "http",
        url: args.url,
        headers: args.headers,
      },
    });
  }
}
