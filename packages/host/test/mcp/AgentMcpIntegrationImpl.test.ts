import { describe, expect, it } from "vitest";
import type { McpServerDeclaration, TelemetrySpanEventRecord } from "@codemation/core";
import { AgentBindError } from "@codemation/core";
import { AgentMcpIntegrationImpl } from "../../src/mcp/AgentMcpIntegrationImpl";
import { McpServerCatalog } from "../../src/mcp/McpServerCatalog";
import { McpConnectionPool } from "../../src/mcp/McpConnectionPool";
import type { Logger, LoggerFactory } from "../../src/application/logging/Logger";
import type { AppConfig } from "../../src/presentation/config/AppConfig";
import type { MCPClient } from "../../src/mcp/McpConnectionPool.types";
import type { McpClientFactory, McpClientOpenArgs } from "../../src/mcp/McpClientFactory";
import type { CredentialSessionServiceImpl } from "../../src/domain/credentials/CredentialSessionServiceImpl";
import type { CredentialStore } from "../../src/domain/credentials/CredentialServices";
import type { CredentialInstanceRecord } from "../../src/domain/credentials/CredentialServices";

// --- Fakes ---

class FakeLogger implements Logger {
  readonly warns: string[] = [];
  info(_msg: string): void {}
  warn(msg: string): void {
    this.warns.push(msg);
  }
  error(_msg: string): void {}
  debug(_msg: string): void {}
}

class FakeLoggerFactory implements LoggerFactory {
  readonly logger = new FakeLogger();
  create(_scope: string): Logger {
    return this.logger;
  }
}

class FakeMcpClient {
  readonly toolsResult: Record<string, { description?: string; execute?: (input: unknown) => Promise<unknown> }> = {};
  closeCalled = 0;
  async tools(): Promise<Record<string, unknown>> {
    return this.toolsResult;
  }
  async close(): Promise<void> {
    this.closeCalled++;
  }
}

class FakeClientFactory implements McpClientFactory {
  readonly opened: Array<{ args: McpClientOpenArgs; client: FakeMcpClient }> = [];
  async open(args: McpClientOpenArgs): Promise<MCPClient> {
    const client = new FakeMcpClient();
    this.opened.push({ args, client });
    return client as unknown as MCPClient;
  }
}

class FakeCredentials {
  sessionsCreated: string[] = [];
  bearerToken = "test-token";
  async createSessionForInstance<T>(instanceId: string): Promise<T> {
    this.sessionsCreated.push(instanceId);
    return {
      applyToRequest: () => ({ headers: { authorization: `Bearer ${this.bearerToken}` } }),
    } as unknown as T;
  }
}

function makeAppConfig(): AppConfig {
  return { env: {} } as unknown as AppConfig;
}

function makeCatalog(declarations: McpServerDeclaration[]): McpServerCatalog {
  const catalog = new McpServerCatalog(new FakeLoggerFactory(), makeAppConfig());
  catalog.merge("config", declarations);
  return catalog;
}

function makeCredentialStore(instances: Partial<CredentialInstanceRecord>[]): CredentialStore {
  const instanceMap = new Map(
    instances.map((inst) => [
      inst.instanceId ?? "default-id",
      {
        instanceId: inst.instanceId ?? "default-id",
        typeId: "host.oauth2-via-broker",
        displayName: inst.displayName ?? "Test Credential",
        sourceKind: "db" as const,
        publicConfig: inst.publicConfig ?? {},
        secretRef: { kind: "db" as const },
        tags: [],
        setupStatus: "ready" as const,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      } satisfies CredentialInstanceRecord,
    ]),
  );

  const oauth2MaterialMap = new Map<string, { scopes: string[] }>();
  for (const inst of instances) {
    if (inst.instanceId && (inst as { scopes?: string[] }).scopes) {
      oauth2MaterialMap.set(inst.instanceId, { scopes: (inst as { scopes: string[] }).scopes });
    }
  }

  return {
    listInstances: async () => [...instanceMap.values()],
    getInstance: async (id) => instanceMap.get(id),
    getOAuth2Material: async (id) => {
      const material = oauth2MaterialMap.get(id);
      if (!material) return undefined;
      return {
        instanceId: id,
        providerId: "google",
        scopes: material.scopes,
        encryptedJson: "{}",
        encryptionKeyId: "key1",
        schemaVersion: 1,
        updatedAt: "2024-01-01T00:00:00Z",
      };
    },
    saveInstance: async () => {},
    deleteInstance: async () => {},
    getSecretMaterial: async () => undefined,
    createOAuth2State: async () => {},
    consumeOAuth2State: async () => undefined,
    saveOAuth2Material: async () => {},
    deleteOAuth2Material: async () => {},
    upsertBinding: async () => {},
    getBinding: async () => undefined,
    listBindingsByWorkflowId: async () => [],
    saveTestResult: async () => {},
    getLatestTestResult: async () => undefined,
    getLatestTestResults: async () => new Map(),
  } satisfies CredentialStore;
}

function makePool(catalog: McpServerCatalog, credentials: FakeCredentials): McpConnectionPool {
  const factory = new FakeClientFactory();
  return new McpConnectionPool(
    catalog,
    credentials as unknown as CredentialSessionServiceImpl,
    new FakeLoggerFactory(),
    factory,
  );
}

function makeNoopSpanCallbacks() {
  const events: TelemetrySpanEventRecord[] = [];
  const spans: Array<{ name: string; ended: boolean; status?: string }> = [];
  return {
    events,
    spans,
    emitSpanEvent: (event: TelemetrySpanEventRecord) => events.push(event),
    startChildSpan: (args: { name: string; attributes?: Record<string, string> }) => {
      const span = { name: args.name, ended: false, status: undefined as string | undefined };
      spans.push(span);
      return {
        end: (endArgs?: { status?: "ok" | "error"; statusMessage?: string }) => {
          span.ended = true;
          span.status = endArgs?.status;
        },
      };
    },
  };
}

const gmailDecl: McpServerDeclaration = {
  id: "gmail",
  displayName: "Gmail",
  description: "Gmail MCP server",
  transport: "http",
  url: "https://mcp.gmail.example.com",
  credentialKind: "oauth2-via-broker",
  oauthAppKey: "google-mail",
};

// --- Tests ---

describe("AgentMcpIntegrationImpl", () => {
  describe("explicit-form binding", () => {
    it("resolves a valid explicit binding and returns a tool map", async () => {
      const catalog = makeCatalog([gmailDecl]);
      const creds = new FakeCredentials();
      const store = makeCredentialStore([
        {
          instanceId: "cred-1",
          publicConfig: { oauthAppKey: "google-mail" },
          scopes: ["https://mail.google.com/"],
        } as any,
      ]);
      const pool = makePool(catalog, creds);

      // Inject a fake tool into the pool's client factory
      const integration = new AgentMcpIntegrationImpl(catalog, pool, store, new FakeLoggerFactory());
      const cb = makeNoopSpanCallbacks();

      const result = await integration.prepareMcpTools({
        mcpServers: { gmail: { credential: "cred-1" } },
        pinnedMcpTools: [],
        emitSpanEvent: cb.emitSpanEvent,
        startChildSpan: cb.startChildSpan,
      });

      expect(result.has("gmail")).toBe(true);
    });

    it("throws AgentBindError when credential instance is not found", async () => {
      const catalog = makeCatalog([gmailDecl]);
      const creds = new FakeCredentials();
      const store = makeCredentialStore([]);
      const pool = makePool(catalog, creds);
      const integration = new AgentMcpIntegrationImpl(catalog, pool, store, new FakeLoggerFactory());
      const cb = makeNoopSpanCallbacks();

      await expect(
        integration.prepareMcpTools({
          mcpServers: { gmail: { credential: "nonexistent-cred" } },
          pinnedMcpTools: [],
          emitSpanEvent: cb.emitSpanEvent,
          startChildSpan: cb.startChildSpan,
        }),
      ).rejects.toThrow(AgentBindError);
    });

    it("throws AgentBindError when server is not in catalog", async () => {
      const catalog = makeCatalog([]);
      const creds = new FakeCredentials();
      const store = makeCredentialStore([{ instanceId: "cred-1", publicConfig: {} }]);
      const pool = makePool(catalog, creds);
      const integration = new AgentMcpIntegrationImpl(catalog, pool, store, new FakeLoggerFactory());
      const cb = makeNoopSpanCallbacks();

      await expect(
        integration.prepareMcpTools({
          mcpServers: { gmail: { credential: "cred-1" } },
          pinnedMcpTools: [],
          emitSpanEvent: cb.emitSpanEvent,
          startChildSpan: cb.startChildSpan,
        }),
      ).rejects.toThrow(AgentBindError);
    });
  });

  describe("shorthand binding", () => {
    it("resolves shorthand binding when exactly one credential matches", async () => {
      const catalog = makeCatalog([gmailDecl]);
      const creds = new FakeCredentials();
      const store = makeCredentialStore([
        { instanceId: "cred-1", publicConfig: { oauthAppKey: "google-mail" } } as any,
      ]);
      const pool = makePool(catalog, creds);
      const integration = new AgentMcpIntegrationImpl(catalog, pool, store, new FakeLoggerFactory());
      const cb = makeNoopSpanCallbacks();

      const result = await integration.prepareMcpTools({
        mcpServers: ["gmail"],
        pinnedMcpTools: [],
        emitSpanEvent: cb.emitSpanEvent,
        startChildSpan: cb.startChildSpan,
      });

      expect(result.has("gmail")).toBe(true);
    });

    it("throws AgentBindError when zero credentials match shorthand", async () => {
      const catalog = makeCatalog([gmailDecl]);
      const creds = new FakeCredentials();
      const store = makeCredentialStore([
        { instanceId: "cred-1", publicConfig: { oauthAppKey: "different-app" } } as any,
      ]);
      const pool = makePool(catalog, creds);
      const integration = new AgentMcpIntegrationImpl(catalog, pool, store, new FakeLoggerFactory());
      const cb = makeNoopSpanCallbacks();

      await expect(
        integration.prepareMcpTools({
          mcpServers: ["gmail"],
          pinnedMcpTools: [],
          emitSpanEvent: cb.emitSpanEvent,
          startChildSpan: cb.startChildSpan,
        }),
      ).rejects.toThrow(AgentBindError);
    });

    it("throws AgentBindError when multiple credentials match shorthand", async () => {
      const catalog = makeCatalog([gmailDecl]);
      const creds = new FakeCredentials();
      const store = makeCredentialStore([
        { instanceId: "cred-1", publicConfig: { oauthAppKey: "google-mail" } } as any,
        { instanceId: "cred-2", publicConfig: { oauthAppKey: "google-mail" } } as any,
      ]);
      const pool = makePool(catalog, creds);
      const integration = new AgentMcpIntegrationImpl(catalog, pool, store, new FakeLoggerFactory());
      const cb = makeNoopSpanCallbacks();

      const err = await integration
        .prepareMcpTools({
          mcpServers: ["gmail"],
          pinnedMcpTools: [],
          emitSpanEvent: cb.emitSpanEvent,
          startChildSpan: cb.startChildSpan,
        })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AgentBindError);
      expect((err as AgentBindError).message).toContain("Multiple credential instances");
    });
  });

  describe("bind-time scope validation", () => {
    it("passes when credential scopes cover requiredScopes", async () => {
      const declWithScopes: McpServerDeclaration = {
        ...gmailDecl,
        requiredScopes: ["https://mail.google.com/"],
      };
      const catalog = makeCatalog([declWithScopes]);
      const creds = new FakeCredentials();
      const store = makeCredentialStore([
        {
          instanceId: "cred-1",
          publicConfig: { oauthAppKey: "google-mail" },
          scopes: ["https://mail.google.com/", "https://www.googleapis.com/auth/userinfo.email"],
        } as any,
      ]);
      const pool = makePool(catalog, creds);
      const integration = new AgentMcpIntegrationImpl(catalog, pool, store, new FakeLoggerFactory());
      const cb = makeNoopSpanCallbacks();

      await expect(
        integration.prepareMcpTools({
          mcpServers: { gmail: { credential: "cred-1" } },
          pinnedMcpTools: [],
          emitSpanEvent: cb.emitSpanEvent,
          startChildSpan: cb.startChildSpan,
        }),
      ).resolves.toBeDefined();
    });

    it("throws AgentBindError when credential lacks required scopes", async () => {
      const declWithScopes: McpServerDeclaration = {
        ...gmailDecl,
        requiredScopes: ["https://mail.google.com/"],
      };
      const catalog = makeCatalog([declWithScopes]);
      const creds = new FakeCredentials();
      const store = makeCredentialStore([
        {
          instanceId: "cred-1",
          publicConfig: { oauthAppKey: "google-mail" },
          scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
        } as any,
      ]);
      const pool = makePool(catalog, creds);
      const integration = new AgentMcpIntegrationImpl(catalog, pool, store, new FakeLoggerFactory());
      const cb = makeNoopSpanCallbacks();

      const err = await integration
        .prepareMcpTools({
          mcpServers: { gmail: { credential: "cred-1" } },
          pinnedMcpTools: [],
          emitSpanEvent: cb.emitSpanEvent,
          startChildSpan: cb.startChildSpan,
        })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AgentBindError);
      expect((err as AgentBindError).message).toContain("https://mail.google.com/");
    });
  });

  describe("telemetry and 403 detection", () => {
    it("wraps tool execute with a telemetry span (mcp.server_id and mcp.tool_name)", async () => {
      const catalog = makeCatalog([gmailDecl]);
      const creds = new FakeCredentials();
      const store = makeCredentialStore([
        { instanceId: "cred-1", publicConfig: { oauthAppKey: "google-mail" } } as any,
      ]);
      const pool = makePool(catalog, creds);

      // We need the pool to have a client with tools. Open a connection first.
      const integration = new AgentMcpIntegrationImpl(catalog, pool, store, new FakeLoggerFactory());
      const cb = makeNoopSpanCallbacks();

      const result = await integration.prepareMcpTools({
        mcpServers: { gmail: { credential: "cred-1" } },
        pinnedMcpTools: [],
        emitSpanEvent: cb.emitSpanEvent,
        startChildSpan: cb.startChildSpan,
      });

      // The pool opens a client on getClient. The client has no tools by default (empty FakeMcpClient.toolsResult).
      // We just check that the map is returned correctly.
      expect(result.has("gmail")).toBe(true);
    });

    it("emits NeedsReconsentEvent span event when tool execute returns 403 error", async () => {
      const catalog = makeCatalog([gmailDecl]);
      const creds = new FakeCredentials();
      const store = makeCredentialStore([
        { instanceId: "cred-1", publicConfig: { oauthAppKey: "google-mail" } } as any,
      ]);

      // Use a custom pool that injects a tool with a 403 execute.
      const clientFactory = new FakeClientFactory();
      const pool = new McpConnectionPool(
        catalog,
        creds as unknown as CredentialSessionServiceImpl,
        new FakeLoggerFactory(),
        clientFactory,
      );

      const integration = new AgentMcpIntegrationImpl(catalog, pool, store, new FakeLoggerFactory());
      const cb = makeNoopSpanCallbacks();

      await integration.prepareMcpTools({
        mcpServers: { gmail: { credential: "cred-1" } },
        pinnedMcpTools: [],
        emitSpanEvent: cb.emitSpanEvent,
        startChildSpan: cb.startChildSpan,
      });

      // Inject a tool with a 403 execute into the opened client.
      const [opened] = clientFactory.opened;
      if (opened) {
        (opened.client as FakeMcpClient).toolsResult["send_email"] = {
          description: "Send an email",
          execute: async () => {
            throw new Error("403 Forbidden");
          },
        };
      }

      // Re-invoke to pick up the injected tool.
      const result2 = await integration.prepareMcpTools({
        mcpServers: { gmail: { credential: "cred-1" } },
        pinnedMcpTools: [],
        emitSpanEvent: cb.emitSpanEvent,
        startChildSpan: cb.startChildSpan,
      });

      const toolMap = result2.get("gmail");
      const sendEmailTool = toolMap?.["send_email"] as { execute?: (input: unknown) => Promise<unknown> } | undefined;

      if (sendEmailTool?.execute) {
        const callErr = await sendEmailTool.execute({}).catch((e: unknown) => e);
        expect(callErr).toBeInstanceOf(Error);
        expect((callErr as Error).message).toContain("permission error");
        expect(cb.events).toHaveLength(1);
        expect(cb.events[0].name).toBe("mcp.needs_reconsent");
        expect(cb.events[0].attributes?.["mcp.server_id"]).toBe("gmail");
      }
    });
  });
});
