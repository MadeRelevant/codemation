import type { ToolSet } from "ai";
import { jsonSchema } from "ai";
import { z } from "zod";
import type { BM25Index } from "./BM25Index";
import type {
  FindToolsResult,
  ToolLoadingStrategy,
  ToolLoadingStrategyInitInput,
  ToolLoadingStrategyTurnContext,
} from "./ToolLoadingStrategy";

const PINNED_TOOLS_SOFT_LIMIT = 8;
const PINNED_TOOLS_HARD_LIMIT = 16;

const FIND_TOOLS_NAME = "find_tools";
const FIND_TOOLS_DEFAULT_LIMIT = 5;

interface McpToolEntry {
  readonly serverId: string;
  readonly toolName: string;
  readonly description: string;
  readonly toolDef: ToolSet[string];
}

/**
 * Default tool-loading strategy: BM25-indexed MCP tool deferral via a `find_tools` meta-tool.
 *
 * - Node-backed tools and pinned MCP tools are always included in every turn.
 * - `find_tools(query, limit?)` is added to the tool set when MCP tools are indexed.
 * - Tools surfaced by `find_tools` are included in subsequent turns.
 *
 * Not DI-managed; instantiated per agent execution by DeferredMetaToolStrategyFactory.
 */
export class DeferredMetaToolStrategy implements ToolLoadingStrategy {
  private nodeBackedTools: ToolSet = {};
  private pinnedTools: ToolSet = {};
  private mcpEntries: McpToolEntry[] = [];
  private toolsByServerId = new Map<string, Map<string, ToolSet[string]>>();
  private foundToolIds = new Set<string>();

  constructor(
    private readonly bm25: BM25Index,
    private readonly warnFn: (message: string) => void,
  ) {}

  async initialize(input: ToolLoadingStrategyInitInput): Promise<void> {
    this.nodeBackedTools = { ...input.nodeBackedTools };

    const pinnedIds = input.pinnedMcpTools ?? [];
    if (pinnedIds.length > PINNED_TOOLS_HARD_LIMIT) {
      throw new Error(
        `Agent config error: pinnedMcpTools count (${pinnedIds.length}) exceeds hard limit of ${PINNED_TOOLS_HARD_LIMIT}.`,
      );
    }
    if (pinnedIds.length > PINNED_TOOLS_SOFT_LIMIT) {
      this.warnFn(
        `Agent config: pinnedMcpTools count (${pinnedIds.length}) is above soft limit (${PINNED_TOOLS_SOFT_LIMIT}); consider deferring some via find_tools.`,
      );
    }

    const indexTexts: string[] = [];
    for (const [serverId, toolSet] of input.mcpToolsByServer.entries()) {
      const serverMap = new Map<string, ToolSet[string]>();
      this.toolsByServerId.set(serverId, serverMap);

      for (const [toolName, toolDef] of Object.entries(toolSet)) {
        serverMap.set(toolName, toolDef);
        const entry: McpToolEntry = {
          serverId,
          toolName,
          description: toolDef.description ?? "",
          toolDef,
        };
        this.mcpEntries.push(entry);
        indexTexts.push(`${toolName} ${entry.description}`);
      }
    }

    if (indexTexts.length > 0) {
      this.bm25.add(indexTexts);
    }

    this.pinnedTools = {};
    for (const pinnedId of pinnedIds) {
      const colonIdx = pinnedId.indexOf(":");
      if (colonIdx === -1) continue;
      const serverId = pinnedId.slice(0, colonIdx);
      const toolName = pinnedId.slice(colonIdx + 1);
      const serverMap = this.toolsByServerId.get(serverId);
      const toolDef = serverMap?.get(toolName);
      if (toolDef) {
        this.pinnedTools[toolName] = toolDef;
      }
    }
  }

  getToolsForTurn(context: ToolLoadingStrategyTurnContext): ToolSet {
    const result: ToolSet = { ...this.nodeBackedTools, ...this.pinnedTools };

    const priorIds = context.previousFoundToolIds ?? [];
    for (const foundId of priorIds) {
      const colonIdx = foundId.indexOf(":");
      if (colonIdx === -1) continue;
      const serverId = foundId.slice(0, colonIdx);
      const toolName = foundId.slice(colonIdx + 1);
      const toolDef = this.toolsByServerId.get(serverId)?.get(toolName);
      if (toolDef && !(toolName in result)) {
        result[toolName] = toolDef;
      }
    }

    if (this.mcpEntries.length > 0) {
      result[FIND_TOOLS_NAME] = this.buildFindToolsDefinition();
    }

    return result;
  }

  ownsToolName(toolName: string): boolean {
    if (toolName === FIND_TOOLS_NAME) return true;
    // Any tool that came from an MCP server is strategy-owned so the coordinator
    // does not attempt to dispatch it as a node-backed tool.
    for (const serverMap of this.toolsByServerId.values()) {
      if (serverMap.has(toolName)) return true;
    }
    return false;
  }

  async executeMetaTool(toolName: string, input: unknown): Promise<unknown> {
    if (toolName === FIND_TOOLS_NAME) {
      const parsed = z.object({ query: z.string(), limit: z.number().int().min(1).max(10).optional() }).parse(input);
      const limit = parsed.limit ?? FIND_TOOLS_DEFAULT_LIMIT;
      const hits = this.bm25.search(parsed.query, limit);
      const results: FindToolsResult[] = hits.map((idx) => {
        const entry = this.mcpEntries[idx];
        return {
          serverId: entry.serverId,
          toolName: entry.toolName,
          description: entry.description,
          inputSchema: (entry.toolDef as unknown as { inputSchema?: unknown }).inputSchema,
        };
      });
      return results;
    }

    // Route to the MCP tool's execute callback (injected by AgentMcpIntegrationImpl with
    // telemetry + 403 detection wrapping).
    for (const serverMap of this.toolsByServerId.values()) {
      const toolDef = serverMap.get(toolName);
      if (toolDef) {
        const executeFn = (toolDef as unknown as { execute?: (input: unknown) => Promise<unknown> }).execute;
        if (executeFn) {
          return await executeFn(input);
        }
        throw new Error(`DeferredMetaToolStrategy: MCP tool "${toolName}" has no execute callback`);
      }
    }

    throw new Error(`DeferredMetaToolStrategy: unknown meta-tool or MCP tool "${toolName}"`);
  }

  recordFoundTools(results: ReadonlyArray<FindToolsResult>): void {
    for (const r of results) {
      this.foundToolIds.add(`${r.serverId}:${r.toolName}`);
    }
  }

  getFoundToolIds(): ReadonlyArray<string> {
    return [...this.foundToolIds];
  }

  private buildFindToolsDefinition(): ToolSet[string] {
    const inputSchemaRecord = {
      type: "object" as const,
      properties: {
        query: {
          type: "string" as const,
          description: "Natural language description of what you want to do.",
        },
        limit: {
          type: "integer" as const,
          minimum: 1,
          maximum: 10,
          description: `Maximum number of tools to return (default ${FIND_TOOLS_DEFAULT_LIMIT}).`,
        },
      },
      required: ["query"],
      additionalProperties: false,
    };

    return {
      description:
        "Search for tools available from connected MCP servers. " +
        "After this call, the tools listed in the result will be callable on your very next turn. " +
        "Use this when you need a capability not visible in your current tool list. " +
        "Do not attempt to call a tool name you have not seen yet — use find_tools to discover it first.",
      inputSchema: jsonSchema(inputSchemaRecord),
    } as unknown as ToolSet[string];
  }
}
