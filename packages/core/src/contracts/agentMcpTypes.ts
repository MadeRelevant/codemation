import type { TelemetrySpanEventRecord } from "./telemetryTypes";

/**
 * Explicit binding form: { gmail: { credential: "<instanceId>" } }
 */
export type McpServerExplicitBinding = Readonly<{
  credential: string; // CredentialInstance.id
}>;

/**
 * Bindings declared on an agent config:
 * - Explicit: { gmail: { credential: "chris-work-gmail" } }
 * - Shorthand: ["gmail", "slack"] — auto-resolves if exactly one credential matches
 */
export type McpServerBindings =
  | readonly string[] // shorthand
  | Readonly<Record<string, McpServerExplicitBinding>>; // explicit

/**
 * Emitted as a span event when a credential is missing required scopes
 * (bind-time) or when callTool returns a permission error (runtime).
 */
export interface NeedsReconsentEvent {
  readonly serverId: string;
  readonly credentialInstanceId: string;
  readonly oauthAppKey?: string;
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
 * Contract implemented by the host. Resolves MCP server bindings declared
 * on an agent config into a ready-to-use tool map (with wrapped execute
 * callbacks for telemetry and 403 detection). Core-nodes imports this
 * interface so AIAgentNode can inject it without depending on the host.
 */
export interface AgentMcpIntegration {
  /**
   * Validate bindings, open pool connections, and return a tool map
   * keyed by serverId. Each tool's execute callback includes:
   * - Telemetry child span (mcp.server_id, mcp.tool_name attributes)
   * - 403/permission error detection → emits a NeedsReconsentEvent span event
   *
   * Throws `AgentBindError` on validation failures (missing server, missing
   * credential instance, insufficient scopes).
   */
  prepareMcpTools(args: {
    readonly mcpServers: McpServerBindings;
    readonly pinnedMcpTools: readonly string[];
    readonly emitSpanEvent: (event: TelemetrySpanEventRecord) => void;
    readonly startChildSpan: (args: { readonly name: string; readonly attributes?: Record<string, string> }) => {
      readonly end: (args?: { status?: "ok" | "error"; statusMessage?: string }) => void;
    };
  }): Promise<AgentMcpToolMap>;
}
