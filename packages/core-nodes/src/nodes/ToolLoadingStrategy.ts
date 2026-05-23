import type { ToolSet } from "ai";

export interface FindToolsResult {
  readonly serverId: string;
  readonly toolName: string;
  readonly description: string;
  readonly inputSchema: unknown;
}

export interface ToolLoadingStrategyTurnContext {
  readonly turnIndex: number;
  readonly previousFoundToolIds?: ReadonlyArray<string>;
}

export interface ToolLoadingStrategyInitInput {
  readonly nodeBackedTools: ToolSet;
  readonly mcpToolsByServer: ReadonlyMap<string, ToolSet>;
  readonly pinnedMcpTools?: ReadonlyArray<string>;
}

export interface ToolLoadingStrategy {
  initialize(input: ToolLoadingStrategyInitInput): Promise<void>;
  getToolsForTurn(context: ToolLoadingStrategyTurnContext): ToolSet;
  ownsToolName(toolName: string): boolean;
  executeMetaTool(toolName: string, input: unknown): Promise<unknown>;
  recordFoundTools(results: ReadonlyArray<FindToolsResult>): void;
  getFoundToolIds(): ReadonlyArray<string>;
}
