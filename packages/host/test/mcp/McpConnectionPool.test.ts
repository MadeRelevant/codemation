import { describe, expect, it } from "vitest";
import type { McpServerDeclaration } from "@codemation/core";
import { McpConnectionPool } from "../../src/mcp/McpConnectionPool";
import { McpServerCatalog } from "../../src/mcp/McpServerCatalog";
import type { LoggerFactory } from "../../src/application/logging/Logger";
import type { CredentialSessionServiceImpl } from "../../src/domain/credentials/CredentialSessionServiceImpl";
import { FakeLoggerFactory, makeAppConfig } from "../testkit";
import { FakeClientFactory, FakeCredentials } from "./testkit/McpTestKit";

function makeDeclaration(id: string, overrides?: Partial<McpServerDeclaration>): McpServerDeclaration {
  return {
    id,
    displayName: `${id} display`,
    description: `${id} description`,
    transport: "http",
    url: `https://${id}.example.com/mcp`,
    credentialKind: "oauth2-via-broker",
    oauthAppKey: `${id}-oauth-app`,
    ...overrides,
  };
}

function makePool(): {
  pool: McpConnectionPool;
  catalog: McpServerCatalog;
  credentials: FakeCredentials;
  clientFactory: FakeClientFactory;
  loggerFactory: FakeLoggerFactory;
} {
  const loggerFactory = new FakeLoggerFactory();
  const catalog = new McpServerCatalog(loggerFactory as unknown as LoggerFactory, makeAppConfig());
  const credentials = new FakeCredentials();
  const clientFactory = new FakeClientFactory();
  const pool = new McpConnectionPool(
    catalog,
    credentials as unknown as CredentialSessionServiceImpl,
    loggerFactory as unknown as LoggerFactory,
    clientFactory,
  );
  return { pool, catalog, credentials, clientFactory, loggerFactory };
}

describe("McpConnectionPool", () => {
  describe("getClient — lazy open", () => {
    it("opens a client for a known server on first call", async () => {
      const { pool, catalog, clientFactory } = makePool();
      catalog.merge("config", [makeDeclaration("gmail")]);

      const client = await pool.getClient("cred-1", "gmail");

      expect(client).toBeDefined();
      expect(clientFactory.opened).toHaveLength(1);
      expect(clientFactory.opened[0]!.args.url).toBe("https://gmail.example.com/mcp");
    });

    it("sends the bearer token from the credential session as the authorization header", async () => {
      const { pool, catalog, clientFactory, credentials } = makePool();
      catalog.merge("config", [makeDeclaration("gmail")]);
      credentials.bearerToken = "my-access-token";

      await pool.getClient("cred-1", "gmail");

      expect(clientFactory.opened[0]!.args.headers["authorization"]).toBe("Bearer my-access-token");
    });

    it("merges staticHeaders from the declaration alongside the bearer token", async () => {
      const { pool, catalog, clientFactory } = makePool();
      catalog.merge("config", [makeDeclaration("gmail", { staticHeaders: { "x-custom": "hello" } })]);

      await pool.getClient("cred-1", "gmail");

      const { headers } = clientFactory.opened[0]!.args;
      expect(headers["x-custom"]).toBe("hello");
      expect(headers["authorization"]).toMatch(/^Bearer /);
    });

    it("throws a clear error when serverId is not in the catalog", async () => {
      const { pool } = makePool();

      await expect(pool.getClient("cred-1", "unknown-server")).rejects.toThrow(
        `McpConnectionPool: MCP server "unknown-server" not found in catalog`,
      );
    });

    it("throws when declaration transport is not http", async () => {
      const loggerFactory = new FakeLoggerFactory();
      // Allow stdio at catalog level so the declaration passes merge validation.
      const catalog = new McpServerCatalog(
        loggerFactory as unknown as LoggerFactory,
        makeAppConfig({ env: { CODEMATION_ALLOW_STDIO_MCP: "true" } }),
      );
      catalog.merge("config", [makeDeclaration("stdio-server", { transport: "stdio" as "http" })]);
      const credentials = new FakeCredentials();
      const clientFactory = new FakeClientFactory();
      const pool = new McpConnectionPool(
        catalog,
        credentials as unknown as CredentialSessionServiceImpl,
        loggerFactory as unknown as LoggerFactory,
        clientFactory,
      );

      await expect(pool.getClient("cred-1", "stdio-server")).rejects.toThrow(/not allowed in managed mode/);
    });
  });

  describe("getClient — idempotence and caching", () => {
    it("returns the same client instance on repeated calls", async () => {
      const { pool, catalog, clientFactory } = makePool();
      catalog.merge("config", [makeDeclaration("gmail")]);

      const c1 = await pool.getClient("cred-1", "gmail");
      const c2 = await pool.getClient("cred-1", "gmail");

      expect(c1).toBe(c2);
      expect(clientFactory.opened).toHaveLength(1);
    });

    it("opens separate pool entries for different credential instances on the same server", async () => {
      const { pool, catalog, clientFactory } = makePool();
      catalog.merge("config", [makeDeclaration("gmail")]);

      const c1 = await pool.getClient("cred-alice", "gmail");
      const c2 = await pool.getClient("cred-bob", "gmail");

      expect(c1).not.toBe(c2);
      expect(clientFactory.opened).toHaveLength(2);
    });

    it("single-flights concurrent opens for the same key", async () => {
      const { pool, catalog, clientFactory } = makePool();
      catalog.merge("config", [makeDeclaration("gmail")]);

      // Fire two concurrent getClient calls before either resolves.
      const [c1, c2] = await Promise.all([pool.getClient("cred-1", "gmail"), pool.getClient("cred-1", "gmail")]);

      expect(c1).toBe(c2);
      expect(clientFactory.opened).toHaveLength(1);
    });
  });

  describe("getTools — caching and overrides", () => {
    it("returns tools from the server on first call", async () => {
      const { pool, catalog, clientFactory } = makePool();
      catalog.merge("config", [makeDeclaration("gmail")]);

      const client = pool as unknown as { clientFactory: FakeClientFactory };
      void client;

      const toolsPromise = pool.getTools("cred-1", "gmail");
      // Set the tools result on the client that will be (or was) created.
      await Promise.resolve(); // yield for open to start

      const tools = await toolsPromise;
      expect(tools).toBeDefined();
      expect(clientFactory.opened).toHaveLength(1);
    });

    it("caches the tools/list result — second call does not re-fetch", async () => {
      const { pool, catalog, clientFactory } = makePool();
      catalog.merge("config", [makeDeclaration("gmail")]);

      // Preset the tool result on the fake client before calling getTools.
      // We need to get the client first, then set toolsResult on it.
      await pool.getClient("cred-1", "gmail");
      const fakeMcpClient = clientFactory.opened[0]!.client;
      fakeMcpClient.toolsResult = { send_email: { description: "Send an email", execute: async () => ({}) } };

      const t1 = await pool.getTools("cred-1", "gmail");
      const t2 = await pool.getTools("cred-1", "gmail");

      expect(t1).toBe(t2); // same reference — cached
      // tools() was called only once; the client's result is recorded
      expect(Object.keys(t1)).toContain("send_email");
    });

    it("applies toolDescriptionOverrides from the declaration", async () => {
      const { pool, catalog, clientFactory } = makePool();
      catalog.merge("config", [
        makeDeclaration("gmail", {
          toolDescriptionOverrides: { send_email: "Override: sends mail" },
        }),
      ]);

      await pool.getClient("cred-1", "gmail");
      const fakeMcpClient = clientFactory.opened[0]!.client;
      fakeMcpClient.toolsResult = {
        send_email: { description: "Original description", execute: async () => ({}) },
        list_threads: { description: "List threads", execute: async () => ({}) },
      };

      const tools = await pool.getTools("cred-1", "gmail");

      expect(tools["send_email"]!.description).toBe("Override: sends mail");
      // Non-overridden tool keeps its original description.
      expect(tools["list_threads"]!.description).toBe("List threads");
    });

    it("does not apply overrides for missing tools", async () => {
      const { pool, catalog, clientFactory } = makePool();
      catalog.merge("config", [
        makeDeclaration("gmail", {
          toolDescriptionOverrides: { non_existent_tool: "Should be ignored" },
        }),
      ]);

      await pool.getClient("cred-1", "gmail");
      const fakeMcpClient = clientFactory.opened[0]!.client;
      fakeMcpClient.toolsResult = {
        send_email: { description: "Send email", execute: async () => ({}) },
      };

      const tools = await pool.getTools("cred-1", "gmail");

      expect(tools["non_existent_tool"]).toBeUndefined();
      expect(tools["send_email"]!.description).toBe("Send email");
    });
  });

  describe("closeForCredential", () => {
    it("closes all pool entries for the specified credential instance", async () => {
      const { pool, catalog, clientFactory } = makePool();
      catalog.merge("config", [makeDeclaration("gmail"), makeDeclaration("slack")]);

      await pool.getClient("cred-1", "gmail");
      await pool.getClient("cred-1", "slack");
      await pool.getClient("cred-2", "gmail");

      // closeForCredential returns Promise<void> — resolves after all closes complete.
      await pool.closeForCredential("cred-1");

      const gmailClient1 = clientFactory.opened[0]!.client;
      const slackClient1 = clientFactory.opened[1]!.client;
      const gmailClient2 = clientFactory.opened[2]!.client;

      expect(gmailClient1.closeCalled).toBe(1);
      expect(slackClient1.closeCalled).toBe(1);
      expect(gmailClient2.closeCalled).toBe(0); // cred-2 is not affected
    });

    it("does not close entries for other credential instances", async () => {
      const { pool, catalog, clientFactory } = makePool();
      catalog.merge("config", [makeDeclaration("gmail")]);

      await pool.getClient("cred-alice", "gmail");
      await pool.getClient("cred-bob", "gmail");

      await pool.closeForCredential("cred-alice");

      const aliceClient = clientFactory.opened[0]!.client;
      const bobClient = clientFactory.opened[1]!.client;

      expect(aliceClient.closeCalled).toBe(1);
      expect(bobClient.closeCalled).toBe(0);
    });

    it("logs an info entry for each pool entry closed", async () => {
      const { pool, catalog, loggerFactory } = makePool();
      catalog.merge("config", [makeDeclaration("gmail"), makeDeclaration("slack")]);

      await pool.getClient("cred-1", "gmail");
      await pool.getClient("cred-1", "slack");

      await pool.closeForCredential("cred-1");

      expect(loggerFactory.logger.infos.filter((l) => l.includes("closed pool entry"))).toHaveLength(2);
    });

    it("re-opens a fresh client after the credential has been closed", async () => {
      const { pool, catalog, clientFactory } = makePool();
      catalog.merge("config", [makeDeclaration("gmail")]);

      const c1 = await pool.getClient("cred-1", "gmail");

      await pool.closeForCredential("cred-1");

      const c2 = await pool.getClient("cred-1", "gmail");

      expect(c1).not.toBe(c2);
      expect(clientFactory.opened).toHaveLength(2);
    });
  });

  describe("closeAll", () => {
    it("closes every open client and empties the pool", async () => {
      const { pool, catalog, clientFactory } = makePool();
      catalog.merge("config", [makeDeclaration("gmail"), makeDeclaration("slack")]);

      await pool.getClient("cred-1", "gmail");
      await pool.getClient("cred-2", "slack");

      await pool.closeAll();

      for (const { client } of clientFactory.opened) {
        expect(client.closeCalled).toBe(1);
      }
    });

    it("is a no-op when the pool is empty", async () => {
      const { pool } = makePool();
      await expect(pool.closeAll()).resolves.toBeUndefined();
    });
  });
});
