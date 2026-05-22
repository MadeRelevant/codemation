import type { ToolSet } from "ai";
import {
  AgentBindError,
  CodemationTelemetryAttributeNames,
  inject,
  injectable,
  type AgentMcpIntegration,
  type AgentMcpToolMap,
  type McpServerBindings,
  type McpServerDeclaration,
  type NeedsReconsentEvent,
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
 * Resolves mcpServers bindings declared on an agent config:
 *  1. Looks up the credential instance in the store (AgentBindError if missing).
 *  2. Looks up each server in the catalog (AgentBindError if missing).
 *  3. Validates requiredScopes ⊆ grantedScopes (AgentBindError if not).
 *  4. Opens pool connections (lazy-open via McpConnectionPool.getClient).
 *  5. Returns a ToolSet map with execute callbacks wrapped for telemetry + 403 detection.
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
    const { mcpServers, pinnedMcpTools: _pinnedMcpTools, emitSpanEvent, startChildSpan } = args;

    const explicit = await this.normalise(mcpServers);
    const result = new Map<string, Readonly<Record<string, unknown>>>();
    const logger = this.loggers.create("AgentMcpIntegrationImpl");

    for (const [serverId, credentialInstanceId] of explicit.entries()) {
      const decl = this.catalog.get(serverId);
      if (!decl) {
        throw new AgentBindError(`MCP server "${serverId}" not found in catalog`);
      }

      // Validate scopes before opening the connection.
      await this.validateScopes(decl, credentialInstanceId);

      // Lazy-open via pool (single-flight, cached after first open).
      await this.pool.getClient(credentialInstanceId, serverId);

      // Fetch tool list from pool (cached after first fetch).
      const rawTools = await this.pool.getTools(credentialInstanceId, serverId);

      // Wrap each tool's execute for telemetry and 403 detection.
      const wrappedTools = this.wrapToolExecutes(
        rawTools as ToolSet,
        serverId,
        credentialInstanceId,
        emitSpanEvent,
        startChildSpan,
        logger,
      );

      result.set(serverId, wrappedTools as unknown as Readonly<Record<string, unknown>>);
    }

    return result;
  }

  /**
   * Converts McpServerBindings (explicit) into a resolved map of
   * serverId → credentialInstanceId.
   */
  private async normalise(bindings: McpServerBindings): Promise<Map<string, string>> {
    const out = new Map<string, string>();

    for (const [serverId, binding] of Object.entries(bindings)) {
      const instance = await this.credentialStore.getInstance(binding.credential);
      if (!instance) {
        throw new AgentBindError(`Credential instance "${binding.credential}" not found for mcpServer "${serverId}"`);
      }
      out.set(serverId, instance.instanceId);
    }

    return out;
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
  private wrapToolExecutes(
    tools: ToolSet,
    serverId: string,
    credentialInstanceId: string,
    emitSpanEvent: (event: TelemetrySpanEventRecord) => void,
    startChildSpan: (args: { name: string; attributes?: Record<string, string> }) => {
      end: (args?: { status?: "ok" | "error"; statusMessage?: string }) => void;
    },
    logger: ReturnType<LoggerFactory["create"]>,
  ): ToolSet {
    const wrapped: Record<string, ToolSet[string]> = {};
    const checkPermissionError = (err: unknown): boolean => this.isPermissionError(err);

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
          try {
            if (!originalExecute) {
              throw new Error(`MCP tool "${toolName}" on server "${serverId}" has no execute callback`);
            }
            const result = await originalExecute(input);
            span.end({ status: "ok" });
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
              // The event carries the structured data; the agent turn continues for other tools.
              throw new Error(
                `MCP tool "${toolName}" on server "${serverId}" returned a permission error. ` +
                  `Reconnect the credential "${credentialInstanceId}" via the Connect flow. ` +
                  `needsReconsent: ${JSON.stringify(event satisfies NeedsReconsentEvent)}`,
                { cause: error },
              );
            }
            span.end({
              status: "error",
              statusMessage: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
        },
      };
      wrapped[toolName] = wrappedDef as unknown as ToolSet[string];
    }

    return wrapped as ToolSet;
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
