import type { MCPClient } from "@ai-sdk/mcp";

export type { MCPClient };

/** The ToolSet shape returned by MCPClient.tools() with 'automatic' schema resolution. */
export type McpToolSet = Awaited<ReturnType<MCPClient["tools"]>>;

export type McpPoolEntry = Readonly<{
  client: MCPClient;
  toolsCache: McpToolSet | null;
  openedAt: Date;
}>;
