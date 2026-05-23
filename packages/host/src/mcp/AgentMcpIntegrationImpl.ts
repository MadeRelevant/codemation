import type { ToolSet } from "ai";
import {
  AgentBindError,
  CodemationTelemetryAttributeNames,
  ConnectionInvocationIdFactory,
  ConnectionNodeIdFactory,
  inject,
  injectable,
  type AgentMcpIntegration,
  type AgentMcpToolMap,
  type ConnectionInvocationAppendArgs,
  type JsonValue,
  type McpServerDeclaration,
  type NeedsReconsentEvent,
  type NodeActivationId,
  type NodeIterationId,
  type ConnectionInvocationId,
  type TelemetrySpanEventRecord,
} from "@codemation/core";
import { ApplicationTokens } from "../applicationTokens";
import type { LoggerFactory } from "../application/logging/Logger";
import { McpServerCatalog } from "./McpServerCatalog";
import { McpConnectionPool } from "./McpConnectionPool";
import type { CredentialStore } from "../domain/credentials/CredentialServices";

/**
 * Host-side implementation of AgentMcpIntegration.
 *
 * Resolves the credential binding for each declared MCP server via the standard
 * credential-binding table — the binding lives on the MCP connection node itself
 * (slot key `"credential"`), matching ChatModel/Tool connection nodes. Opens pool
 * connections and returns a ToolSet map with execute callbacks wrapped for
 * telemetry + 403 detection.
 */
@injectable()
export class AgentMcpIntegrationImpl implements AgentMcpIntegration {
  constructor(
    @inject(McpServerCatalog) private readonly catalog: McpServerCatalog,
    @inject(McpConnectionPool) private readonly pool: McpConnectionPool,
    @inject(ApplicationTokens.CredentialStore) private readonly credentialStore: CredentialStore,
    @inject(ApplicationTokens.LoggerFactory) private readonly loggers: LoggerFactory,
  ) {}

  async prepareMcpTools(args: Parameters<AgentMcpIntegration["prepareMcpTools"]>[0]): Promise<AgentMcpToolMap> {
    const {
      workflowId,
      agentNodeId,
      serverIds,
      pinnedMcpTools: _pinnedMcpTools,
      emitSpanEvent,
      startChildSpan,
      appendMcpInvocation,
      parentAgentActivationId,
      iterationId,
      itemIndex,
      parentInvocationId,
    } = args;

    const result = new Map<string, Readonly<Record<string, unknown>>>();
    const logger = this.loggers.create("AgentMcpIntegrationImpl");

    for (const serverId of serverIds) {
      const decl = this.catalog.get(serverId);
      if (!decl) {
        throw new AgentBindError(`MCP server "${serverId}" not found in catalog`);
      }

      const credentialInstanceId = await this.resolveCredentialInstanceId(workflowId, agentNodeId, serverId);

      // Validate scopes before opening the connection.
      await this.validateScopes(decl, credentialInstanceId);

      // Lazy-open via pool (single-flight, cached after first open).
      await this.pool.getClient(credentialInstanceId, serverId);

      // Fetch tool list from pool (cached after first fetch).
      const rawTools = await this.pool.getTools(credentialInstanceId, serverId);

      // Wrap each tool's execute for telemetry and 403 detection.
      const wrappedTools = this.wrapToolExecutes({
        tools: rawTools as ToolSet,
        serverId,
        credentialInstanceId,
        agentNodeId,
        emitSpanEvent,
        startChildSpan,
        logger,
        appendMcpInvocation,
        parentAgentActivationId,
        iterationId,
        itemIndex,
        parentInvocationId,
      });

      result.set(serverId, wrappedTools as unknown as Readonly<Record<string, unknown>>);
    }

    return result;
  }

  /**
   * Looks up the credential binding for the MCP connection node and verifies the
   * referenced credential instance still exists.
   */
  private async resolveCredentialInstanceId(workflowId: string, agentNodeId: string, serverId: string): Promise<string> {
    const mcpNodeId = ConnectionNodeIdFactory.mcpConnectionNodeId(agentNodeId, serverId);
    const binding = await this.credentialStore.getBinding({ workflowId, nodeId: mcpNodeId, slotKey: "credential" });
    if (!binding) {
      throw new AgentBindError(
        `MCP server "${serverId}" has no credential bound on connection node "${mcpNodeId}". ` +
          `Bind a credential instance via the canvas credential dropdown before activation.`,
      );
    }
    const instance = await this.credentialStore.getInstance(binding.instanceId);
    if (!instance) {
      throw new AgentBindError(
        `Credential instance "${binding.instanceId}" not found for mcpServer "${serverId}" (connection node "${mcpNodeId}")`,
      );
    }
    return instance.instanceId;
  }

  /**
   * Validates that the credential instance's granted scopes cover the server's requiredScopes.
   * Scopes are read from the OAuth2 material record (populated by the broker push endpoint).
   */
  private async validateScopes(decl: McpServerDeclaration, credentialInstanceId: string): Promise<void> {
    if (!decl.requiredScopes?.length) {
      return;
    }

    const material = await this.credentialStore.getOAuth2Material(credentialInstanceId);
    const grantedScopes = new Set(material?.scopes ?? []);
    const missing = decl.requiredScopes.filter((s) => !grantedScopes.has(s));

    if (missing.length > 0) {
      throw new AgentBindError(
        `Credential instance "${credentialInstanceId}" lacks required scopes for server "${decl.id}": ${missing.join(", ")}. ` +
          `Reconnect the credential to grant the missing scopes.`,
      );
    }
  }

  /**
   * Returns a new ToolSet where each tool's execute callback is replaced with a wrapped version
   * that:
   * - Opens a child telemetry span tagged with mcp.server_id and mcp.tool_name.
   * - Calls the original tool's execute (from @ai-sdk/mcp), which internally calls the MCP server.
   * - On 403 / permission errors: emits a NeedsReconsentEvent span event, closes the span with
   *   error status, and re-throws a descriptive error. The agent turn continues for other tools.
   */
  private wrapToolExecutes(args: {
    tools: ToolSet;
    serverId: string;
    credentialInstanceId: string;
    agentNodeId: string;
    emitSpanEvent: (event: TelemetrySpanEventRecord) => void;
    startChildSpan: (args: { name: string; attributes?: Record<string, string> }) => {
      end: (args?: { status?: "ok" | "error"; statusMessage?: string }) => void;
    };
    logger: ReturnType<LoggerFactory["create"]>;
    appendMcpInvocation?: (args: ConnectionInvocationAppendArgs) => Promise<void>;
    parentAgentActivationId?: NodeActivationId;
    iterationId?: NodeIterationId;
    itemIndex?: number;
    parentInvocationId?: ConnectionInvocationId;
  }): ToolSet {
    const {
      tools,
      serverId,
      credentialInstanceId,
      agentNodeId,
      emitSpanEvent,
      startChildSpan,
      logger,
      appendMcpInvocation,
      parentAgentActivationId,
      iterationId,
      itemIndex,
      parentInvocationId,
    } = args;
    const wrapped: Record<string, ToolSet[string]> = {};
    const checkPermissionError = (err: unknown): boolean => this.isPermissionError(err);
    const connectionNodeId = ConnectionNodeIdFactory.mcpConnectionNodeId(agentNodeId, serverId);

    for (const [toolName, toolDef] of Object.entries(tools)) {
      const originalExecute = (toolDef as { execute?: (input: unknown) => Promise<unknown> }).execute;
      const wrappedDef = {
        ...toolDef,
        execute: async (input: unknown): Promise<unknown> => {
          const span = startChildSpan({
            name: "mcp.tool_call",
            attributes: {
              [CodemationTelemetryAttributeNames.mcpServerId]: serverId,
              [CodemationTelemetryAttributeNames.mcpToolName]: toolName,
            },
          });
          const invocationId = ConnectionInvocationIdFactory.create();
          const startedAtIso = new Date().toISOString();
          const baseRecord = {
            invocationId,
            connectionNodeId,
            parentAgentNodeId: agentNodeId,
            parentAgentActivationId: parentAgentActivationId ?? agentNodeId,
            iterationId,
            itemIndex,
            parentInvocationId,
            subjectName: toolName,
          };
          const summarizedInput = this.summarizeForInvocation(input);
          if (appendMcpInvocation) {
            await appendMcpInvocation({
              ...baseRecord,
              status: "running",
              managedInput: summarizedInput,
              queuedAt: startedAtIso,
              startedAt: startedAtIso,
              statusLabel: `calling ${toolName}`,
            });
          }
          try {
            if (!originalExecute) {
              throw new Error(`MCP tool "${toolName}" on server "${serverId}" has no execute callback`);
            }
            const result = await originalExecute(input);
            span.end({ status: "ok" });
            if (appendMcpInvocation) {
              const finishedAtIso = new Date().toISOString();
              await appendMcpInvocation({
                ...baseRecord,
                status: "completed",
                managedInput: summarizedInput,
                managedOutput: this.summarizeForInvocation(result),
                queuedAt: startedAtIso,
                startedAt: startedAtIso,
                finishedAt: finishedAtIso,
              });
            }
            return result;
          } catch (error) {
            if (checkPermissionError(error)) {
              const event: NeedsReconsentEvent = {
                serverId,
                credentialInstanceId,
              };
              const spanEvent: TelemetrySpanEventRecord = {
                name: "mcp.needs_reconsent",
                attributes: {
                  "mcp.server_id": serverId,
                  "mcp.credential_instance_id": credentialInstanceId,
                },
              };
              emitSpanEvent(spanEvent);
              span.end({ status: "error", statusMessage: "MCP tool permission error" });
              logger.warn(
                `AgentMcpIntegrationImpl: permission error from MCP tool "${toolName}" on server "${serverId}". ` +
                  `NeedsReconsentEvent emitted for credential instance "${credentialInstanceId}".`,
                error instanceof Error ? error : undefined,
              );
              const wrapped = new Error(
                `MCP tool "${toolName}" on server "${serverId}" returned a permission error. ` +
                  `Reconnect the credential "${credentialInstanceId}" via the Connect flow. ` +
                  `needsReconsent: ${JSON.stringify(event satisfies NeedsReconsentEvent)}`,
                { cause: error },
              );
              if (appendMcpInvocation) {
                await appendMcpInvocation({
                  ...baseRecord,
                  status: "failed",
                  managedInput: summarizedInput,
                  error: { message: wrapped.message, name: wrapped.name },
                  queuedAt: startedAtIso,
                  startedAt: startedAtIso,
                  finishedAt: new Date().toISOString(),
                });
              }
              // The event carries the structured data; the agent turn continues for other tools.
              throw wrapped;
            }
            const effectiveMessage = error instanceof Error ? error.message : String(error);
            span.end({
              status: "error",
              statusMessage: effectiveMessage,
            });
            if (appendMcpInvocation) {
              await appendMcpInvocation({
                ...baseRecord,
                status: "failed",
                managedInput: summarizedInput,
                error: { message: effectiveMessage, name: error instanceof Error ? error.name : undefined },
                queuedAt: startedAtIso,
                startedAt: startedAtIso,
                finishedAt: new Date().toISOString(),
              });
            }
            throw error;
          }
        },
      };
      wrapped[toolName] = wrappedDef as unknown as ToolSet[string];
    }

    return wrapped as ToolSet;
  }

  private summarizeForInvocation(value: unknown): JsonValue | undefined {
    if (value === undefined) return undefined;
    try {
      const serialized = JSON.stringify(value);
      if (serialized.length > 1024) {
        return { truncated: true, preview: serialized.slice(0, 1024) };
      }
      return JSON.parse(serialized) as JsonValue;
    } catch {
      return undefined;
    }
  }

  /**
   * Detects 403 / MCP-level permission / scope-insufficiency errors from callTool.
   * The exact shape depends on how @ai-sdk/mcp surfaces them — we check for HTTP status
   * 403, MCP error codes (insufficient_scope / UNAUTHORIZED), and common message patterns.
   */
  private isPermissionError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    const msg = error.message.toLowerCase();
    // HTTP 403 from the MCP transport
    if (msg.includes("403") || msg.includes("forbidden")) {
      return true;
    }
    // MCP-level error codes
    if (msg.includes("insufficient_scope") || msg.includes("unauthorized") || msg.includes("unauthenticated")) {
      return true;
    }
    // Check error name or code
    const candidate = error as Error & { statusCode?: number; code?: string };
    if (candidate.statusCode === 403 || candidate.code === "EUNAUTHORIZED") {
      return true;
    }
    return false;
  }
}
