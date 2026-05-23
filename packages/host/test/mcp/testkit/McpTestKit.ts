import type { MCPClient } from "../../../src/mcp/McpConnectionPool.types";
import type { McpClientFactory, McpClientOpenArgs } from "../../../src/mcp/McpClientFactory";

/**
 * Minimal fake MCPClient. Only implements tools() and close() — the two methods
 * McpConnectionPool actually invokes. Cast to MCPClient at call sites.
 */
export class FakeMcpClient {
  closeCalled = 0;
  toolsResult: Record<string, unknown> = {};

  async tools(): Promise<Record<string, unknown>> {
    return this.toolsResult;
  }

  async close(): Promise<void> {
    this.closeCalled++;
  }
}

/**
 * McpClientFactory that records opened connections and returns a FakeMcpClient.
 * Optionally seed a specific client via the constructor to share it across calls.
 */
export class FakeClientFactory implements McpClientFactory {
  readonly opened: Array<{ args: McpClientOpenArgs; client: FakeMcpClient }> = [];
  private readonly seededClient: FakeMcpClient | undefined;

  constructor(seededClient?: FakeMcpClient) {
    this.seededClient = seededClient;
  }

  async open(args: McpClientOpenArgs): Promise<MCPClient> {
    const client = this.seededClient ?? new FakeMcpClient();
    this.opened.push({ args, client });
    return client as unknown as MCPClient;
  }
}

/**
 * CredentialOAuth2MaterialReader fake. Records which instance IDs were read and returns
 * a stub OAuthMaterial with a configurable access token. The pool depends on the reader,
 * which encapsulates store-lookup + decrypt + refresh-on-read; tests don't need to
 * exercise those internals through the pool.
 */
export class FakeOAuth2MaterialReader {
  readonly reads: string[] = [];
  bearerToken = "test-token";
  /** When set, readMaterial throws "has no OAuth2 material" (simulates a never-connected instance). */
  missing = false;

  async readMaterial(instanceId: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: string;
    grantedScopes: ReadonlyArray<string>;
  }> {
    this.reads.push(instanceId);
    if (this.missing) {
      throw new Error(`CredentialOAuth2MaterialReader: instance "${instanceId}" has no OAuth2 material`);
    }
    return { accessToken: this.bearerToken, grantedScopes: [] };
  }
}
