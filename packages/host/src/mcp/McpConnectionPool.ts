import { inject, injectable } from "@codemation/core";
import { ApplicationTokens } from "../applicationTokens";
import type { LoggerFactory } from "../application/logging/Logger";
import { McpServerCatalog } from "./McpServerCatalog";
import { DefaultMcpClientFactory } from "./McpClientFactory";
import type { McpClientFactory } from "./McpClientFactory";
import { CredentialOAuth2MaterialReader } from "../credentials/CredentialOAuth2MaterialReader";
import type { MCPClient, McpToolSet } from "./McpConnectionPool.types";

/** Mutable internal pool entry (toolsCache may be filled lazily). */
type MutablePoolEntry = {
  client: MCPClient;
  toolsCache: McpToolSet | null;
  openedAt: Date;
};

@injectable()
export class McpConnectionPool {
  /** Key: `${credentialInstanceId}:${serverId}` */
  private readonly pool = new Map<string, MutablePoolEntry>();
  /**
   * In-flight open promises — prevents a double-open race when two callers request
   * the same (credentialInstanceId, serverId) pair concurrently.
   */
  private readonly inFlight = new Map<string, Promise<MutablePoolEntry>>();

  constructor(
    @inject(McpServerCatalog) private readonly catalog: McpServerCatalog,
    @inject(CredentialOAuth2MaterialReader) private readonly oauth2Material: CredentialOAuth2MaterialReader,
    @inject(ApplicationTokens.LoggerFactory) private readonly loggers: LoggerFactory,
    @inject(DefaultMcpClientFactory) private readonly clientFactory: McpClientFactory,
  ) {}

  /**
   * Returns a live MCP client for the given credential instance + server.
   * Opens a new connection lazily; subsequent calls with the same pair return the cached client.
   * Two concurrent calls for the same pair share a single open operation (single-flight).
   */
  async getClient(credentialInstanceId: string, serverId: string): Promise<MCPClient> {
    const entry = await this.getOrOpenEntry(credentialInstanceId, serverId);
    return entry.client;
  }

  /**
   * Returns the tools/list result for the given credential instance + server,
   * with toolDescriptionOverrides from the declaration applied.
   * Fetches and caches once per pool entry; subsequent calls return the cached value.
   * Used by Story 10's BM25 indexer.
   */
  async getTools(credentialInstanceId: string, serverId: string): Promise<McpToolSet> {
    const entry = await this.getOrOpenEntry(credentialInstanceId, serverId);
    if (!entry.toolsCache) {
      const raw = await entry.client.tools();
      const decl = this.catalog.get(serverId);
      entry.toolsCache = this.applyOverrides(raw, decl?.toolDescriptionOverrides);
    }
    return entry.toolsCache;
  }

  /**
   * Closes all pool entries for a credential instance.
   * Call this when the credential is revoked or disconnected.
   * Token refresh does NOT require closing — OAuthFlowExecutor
   * keeps the stored token fresh; the next open will read the current token.
   *
   * Resolves after all matched clients have completed close(), so callers can
   * await this before re-connecting or cleaning up downstream state.
   *
   * TODO(story-credential-lifecycle): Wire this method to the credential lifecycle event.
   * CredentialDisconnectedError (packages/host/src/credentials/refresh/CredentialDisconnectedError.ts)
   * is thrown on dead refresh tokens but is an error, not a broadcast event — there is no
   * event bus for credential lifecycle today. When a credential-disconnected event mechanism
   * is introduced, call closeForCredential(credentialInstanceId) from its handler so that
   * stale MCP pool entries are cleaned up on credential revocation.
   */
  async closeForCredential(credentialInstanceId: string): Promise<void> {
    const logger = this.loggers.create("McpConnectionPool");
    const prefix = `${credentialInstanceId}:`;
    const toClose: Array<[string, MutablePoolEntry]> = [];
    for (const [key, entry] of this.pool.entries()) {
      if (key.startsWith(prefix)) {
        toClose.push([key, entry]);
        this.pool.delete(key);
        logger.info(`McpConnectionPool: closed pool entry on credential revocation (key=${key})`);
      }
    }
    await Promise.allSettled(
      toClose.map(([key, entry]) =>
        entry.client.close().catch((e: unknown) => {
          logger.warn(
            `McpConnectionPool: error closing client on credential revocation (key=${key})`,
            e instanceof Error ? e : undefined,
          );
        }),
      ),
    );
  }

  /**
   * Closes all pool entries. Called on host shutdown.
   */
  async closeAll(): Promise<void> {
    await Promise.allSettled([...this.pool.values()].map((e) => e.client.close()));
    this.pool.clear();
    this.inFlight.clear();
  }

  private async getOrOpenEntry(credentialInstanceId: string, serverId: string): Promise<MutablePoolEntry> {
    const key = this.poolKey(credentialInstanceId, serverId);
    const cached = this.pool.get(key);
    if (cached) {
      return cached;
    }
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing;
    }
    const openPromise = this.open(credentialInstanceId, serverId, key).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, openPromise);
    return openPromise;
  }

  private async open(credentialInstanceId: string, serverId: string, key: string): Promise<MutablePoolEntry> {
    const decl = this.catalog.get(serverId);
    if (!decl) {
      throw new Error(`McpConnectionPool: MCP server "${serverId}" not found in catalog`);
    }
    // D1: HTTP-only in managed mode. The catalog already blocks stdio at merge time, but we
    // double-check here as a defensive guard in case a declaration bypasses the catalog (e.g.
    // a future in-memory test harness or a dynamically injected server that skips catalog
    // validation). Transport is an attribute of the declaration, not the env var.
    if (decl.transport !== "http") {
      throw new Error(
        `McpConnectionPool: MCP server "${serverId}" uses transport "${decl.transport}" which is not allowed in managed mode. ` +
          `Only "http" transport is supported. For stdio, set CODEMATION_ALLOW_STDIO_MCP=true in a self-hosted environment.`,
      );
    }

    // Read OAuth material directly. The bearer is baked into the client's headers at open
    // time (per-open, not per-call) — @ai-sdk/mcp v1.0.42 does not support per-request header
    // injection. LIMITATION: a pool entry uses a stale bearer after the access token expires;
    // OAuthFlowExecutor refreshes stored material in the background, but the entry must be
    // closed via closeForCredential and re-opened for the refreshed token to take effect.
    const accessToken = await this.readAccessToken(credentialInstanceId, serverId);
    const headers: Record<string, string> = {
      ...(decl.staticHeaders ?? {}),
      authorization: `Bearer ${accessToken}`,
    };

    const client = await this.clientFactory.open({ url: decl.url, headers });
    const entry: MutablePoolEntry = { client, toolsCache: null, openedAt: new Date() };
    this.pool.set(key, entry);
    return entry;
  }

  private poolKey(credentialInstanceId: string, serverId: string): string {
    return `${credentialInstanceId}:${serverId}`;
  }

  private async readAccessToken(credentialInstanceId: string, serverId: string): Promise<string> {
    const material = await this.oauth2Material.readMaterial(credentialInstanceId);
    if (!material.accessToken) {
      throw new Error(
        `McpConnectionPool: credential instance "${credentialInstanceId}" has no access token — reconnect the credential bound to MCP server "${serverId}"`,
      );
    }
    return material.accessToken;
  }

  private applyOverrides(tools: McpToolSet, overrides?: Record<string, string>): McpToolSet {
    if (!overrides) {
      return tools;
    }
    const result = { ...tools };
    for (const [name, description] of Object.entries(overrides)) {
      if (result[name]) {
        result[name] = { ...result[name], description };
      }
    }
    return result;
  }
}
