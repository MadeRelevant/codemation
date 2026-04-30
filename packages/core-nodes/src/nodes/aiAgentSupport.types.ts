import type {
  AgentToolCall,
  ConnectionInvocationId,
  Item,
  NodeInputsByPort,
  TelemetrySpanScope,
  ToolConfig,
  ToolExecuteArgs,
  ZodSchemaAny,
} from "@codemation/core";

export class AgentItemPortMap {
  static fromItem(item: Item): NodeInputsByPort {
    return { in: [item] };
  }
}

export type ResolvedTool = Readonly<{
  config: ToolConfig;
  runtime: Readonly<{
    defaultDescription: string;
    inputSchema: ZodSchemaAny;
    execute(args: ToolExecuteArgs<ToolConfig, unknown>): Promise<unknown>;
  }>;
}>;

/**
 * Per-item binding of a tool: the user config plus the resolved runtime and a snapshot of the
 * original Zod `inputSchema`.
 *
 * `execute` accepts optional `hooks` so the agent coordinator can pass the live `agent.tool.call`
 * span and the planned tool-call's `invocationId`. Node-backed sub-agent tools use these hooks
 * via {@link ChildExecutionScopeFactory} to re-root their runtime ctx under the tool-call boundary
 * (fresh activationId, telemetry parented at the tool-call span, `parentInvocationId` set).
 */
export type ItemScopedToolBinding = Readonly<{
  config: ToolConfig;
  inputSchema: ZodSchemaAny;
  execute(input: unknown, hooks?: ItemScopedToolCallHooks): Promise<unknown>;
}>;

export type ItemScopedToolCallHooks = Readonly<{
  /** Live agent.tool.call span (used to parent sub-agent telemetry). */
  parentSpan?: TelemetrySpanScope;
  /** invocationId of the parent tool call (used to thread `parentInvocationId` through ctx). */
  parentInvocationId?: ConnectionInvocationId;
}>;

export type PlannedToolCall = Readonly<{
  binding: ItemScopedToolBinding;
  toolCall: AgentToolCall;
  invocationIndex: number;
  nodeId: string;
  /** Stable id reused across queued / running / completed connection invocation rows for this tool call. */
  invocationId: string;
}>;

export type ExecutedToolCall = Readonly<{
  toolName: string;
  toolCallId: string;
  result: unknown;
  serialized: string;
}>;
