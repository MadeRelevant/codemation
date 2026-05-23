import type { NodeId, WorkflowId } from "./baseTypes";
import type { TelemetrySpanEventRecord } from "./telemetryTypes";

/**
 * Emitted as a span event when a credential is missing required scopes
 * (bind-time) or when callTool returns a permission error (runtime).
 * The credential type id can be looked up from the credential instance when needed.
 */
export interface NeedsReconsentEvent {
  readonly serverId: string;
  readonly credentialInstanceId: string;
  readonly missingScopesHint?: readonly string[];
}

/**
 * An opaque MCP tool map: keyed by serverId → (toolName → tool definition).
 * Typed as unknown so core does not depend on the AI SDK's ToolSet type.
 * AIAgentNode (in core-nodes, which does depend on ai) casts this to
 * ReadonlyMap<string, ToolSet> before passing to DeferredMetaToolStrategyFactory.
 */
export type AgentMcpToolMap = ReadonlyMap<string, Readonly<Record<string, unknown>>>;

/**
 * Contract implemented by the host. Resolves MCP server bindings for an agent run
 * via the standard credential-binding table (one slot per declared server, keyed
 * by `(workflowId, agentNodeId, "mcp:<serverId>")`), and returns a ready-to-use
 * tool map with wrapped execute callbacks for telemetry and 403 detection.
 * Core-nodes imports this interface so AIAgentNode can inject it without
 * depending on the host.
 */
export interface AgentMcpIntegration {
  /**
   * Look up the credential binding per server, validate scopes, open pool
   * connections, and return a tool map keyed by serverId. Each tool's
   * execute callback includes:
   * - Telemetry child span (mcp.server_id, mcp.tool_name attributes)
   * - 403/permission error detection → emits a NeedsReconsentEvent span event
   *
   * Throws `AgentBindError` on validation failures (missing server, unbound
   * credential slot, missing credential instance, insufficient scopes).
   */
  prepareMcpTools(args: {
    readonly workflowId: WorkflowId;
    readonly agentNodeId: NodeId;
    readonly serverIds: ReadonlyArray<string>;
    readonly pinnedMcpTools: readonly string[];
    readonly emitSpanEvent: (event: TelemetrySpanEventRecord) => void;
    readonly startChildSpan: (args: { readonly name: string; readonly attributes?: Record<string, string> }) => {
      readonly end: (args?: { status?: "ok" | "error"; statusMessage?: string }) => void;
    };
  }): Promise<AgentMcpToolMap>;
}

/**
 * Deterministic slot key for the credential binding of an MCP server attached
 * to an agent. The binding lives at `(workflowId, agentNodeId, mcpSlotKey(serverId))`.
 */
export const mcpSlotKey = (serverId: string): string => `mcp:${serverId}`;
