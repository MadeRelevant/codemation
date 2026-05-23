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
 * Minimal OAuth2 material store fake. Records which instance IDs were queried and returns
 * a sentinel encrypted record (the cipher fake below short-circuits decryption).
 */
export class FakeOAuth2MaterialStore {
  readonly queries: string[] = [];
  /** When set, getOAuth2Material returns undefined for any instance id (simulates "not connected"). */
  missing = false;

  async getOAuth2Material(instanceId: string): Promise<unknown> {
    this.queries.push(instanceId);
    if (this.missing) {
      return undefined;
    }
    return { instanceId, encryptedJson: "sentinel", encryptionKeyId: "k", schemaVersion: 1 };
  }
}

/**
 * Cipher fake. decrypt() returns a fixed accessToken regardless of the input record.
 */
export class FakeCredentialSecretCipher {
  bearerToken = "test-token";

  decrypt(_record: unknown): Record<string, unknown> {
    return { accessToken: this.bearerToken };
  }
}
