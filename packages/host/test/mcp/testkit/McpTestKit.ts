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
 * Credential session fake. Records which instance IDs sessions were requested for
 * and returns a request-modifier that adds a Bearer token.
 */
export class FakeCredentials {
  readonly sessionsCreated: string[] = [];
  bearerToken = "test-token";

  async createSessionForInstance<TSession = unknown>(instanceId: string): Promise<TSession> {
    this.sessionsCreated.push(instanceId);
    return {
      applyToRequest: (_spec: unknown) => ({
        headers: { authorization: `Bearer ${this.bearerToken}` },
      }),
    } as TSession;
  }
}
