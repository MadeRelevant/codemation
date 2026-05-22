import { describe, expect, it } from "vitest";
import type { McpServerDeclaration, TelemetrySpanEventRecord } from "@codemation/core";
import { AgentBindError } from "@codemation/core";
import { AgentMcpIntegrationImpl } from "../../src/mcp/AgentMcpIntegrationImpl";
import { McpServerCatalog } from "../../src/mcp/McpServerCatalog";
import { McpConnectionPool } from "../../src/mcp/McpConnectionPool";
import type { LoggerFactory } from "../../src/application/logging/Logger";
import type { CredentialSessionServiceImpl } from "../../src/domain/credentials/CredentialSessionServiceImpl";
import type { CredentialStore } from "../../src/domain/credentials/CredentialServices";
import type { CredentialInstanceRecord } from "../../src/domain/credentials/CredentialServices";
import { FakeLoggerFactory, makeAppConfig } from "../testkit";
import { FakeMcpClient, FakeClientFactory, FakeCredentials } from "./testkit/McpTestKit";

function makeCatalog(declarations: McpServerDeclaration[]): McpServerCatalog {
  const catalog = new McpServerCatalog(new FakeLoggerFactory() as unknown as LoggerFactory, makeAppConfig());
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
  const spans: Array<{
    name: string;
    ended: boolean;
    status?: string;
    attributes?: Record<string, string>;
  }> = [];
  return {
    events,
    spans,
    emitSpanEvent: (event: TelemetrySpanEventRecord) => events.push(event),
    startChildSpan: (args: { name: string; attributes?: Record<string, string> }) => {
      const span = {
        name: args.name,
        ended: false,
        status: undefined as string | undefined,
        attributes: args.attributes,
      };
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
  acceptedCredentialTypes: ["oauth.google.gmail"],
  // TODO: remove with broker cleanup — oauthAppKey used by autoResolveCredential shorthand
  ...({ oauthAppKey: "google-mail" } as unknown as object),
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
    it("wraps tool execute with a telemetry span tagged mcp.server_id and mcp.tool_name", async () => {
      const catalog = makeCatalog([gmailDecl]);
      const creds = new FakeCredentials();
      const store = makeCredentialStore([
        { instanceId: "cred-1", publicConfig: { oauthAppKey: "google-mail" } } as any,
      ]);

      // Pre-seed the client with a successful tool so we get a real span on execute.
      const seededClient = new FakeMcpClient();
      seededClient.toolsResult["list_messages"] = {
        description: "List messages",
        execute: async () => ({ messages: [] }),
      };

      const clientFactory = new FakeClientFactory(seededClient);
      const pool = new McpConnectionPool(
        catalog,
        creds as unknown as CredentialSessionServiceImpl,
        new FakeLoggerFactory(),
        clientFactory,
      );

      const integration = new AgentMcpIntegrationImpl(catalog, pool, store, new FakeLoggerFactory());
      const cb = makeNoopSpanCallbacks();

      const result = await integration.prepareMcpTools({
        mcpServers: { gmail: { credential: "cred-1" } },
        pinnedMcpTools: [],
        emitSpanEvent: cb.emitSpanEvent,
        startChildSpan: cb.startChildSpan,
      });

      const toolMap = result.get("gmail");
      const listMessages = toolMap?.["list_messages"] as { execute?: (input: unknown) => Promise<unknown> } | undefined;
      expect(listMessages).toBeDefined();

      await listMessages!.execute!({});

      expect(cb.spans).toHaveLength(1);
      expect(cb.spans[0].name).toBe("mcp.tool_call");
      expect(cb.spans[0].attributes?.["mcp.server_id"]).toBe("gmail");
      expect(cb.spans[0].attributes?.["mcp.tool_name"]).toBe("list_messages");
      expect(cb.spans[0].status).toBe("ok");
    });

    it("emits NeedsReconsentEvent span event when tool execute returns 403 error", async () => {
      const catalog = makeCatalog([gmailDecl]);
      const creds = new FakeCredentials();
      const store = makeCredentialStore([
        { instanceId: "cred-1", publicConfig: { oauthAppKey: "google-mail" } } as any,
      ]);

      // Pre-seed the client with a tool that throws 403 BEFORE the pool opens it.
      const seededClient = new FakeMcpClient();
      seededClient.toolsResult["send_email"] = {
        description: "Send an email",
        execute: async () => {
          throw new Error("403 Forbidden");
        },
      };

      const clientFactory = new FakeClientFactory(seededClient);
      const pool = new McpConnectionPool(
        catalog,
        creds as unknown as CredentialSessionServiceImpl,
        new FakeLoggerFactory(),
        clientFactory,
      );

      const integration = new AgentMcpIntegrationImpl(catalog, pool, store, new FakeLoggerFactory());
      const cb = makeNoopSpanCallbacks();

      const result = await integration.prepareMcpTools({
        mcpServers: { gmail: { credential: "cred-1" } },
        pinnedMcpTools: [],
        emitSpanEvent: cb.emitSpanEvent,
        startChildSpan: cb.startChildSpan,
      });

      const toolMap = result.get("gmail");
      const sendEmailTool = toolMap?.["send_email"] as { execute?: (input: unknown) => Promise<unknown> } | undefined;
      expect(sendEmailTool).toBeDefined();
      expect(typeof sendEmailTool?.execute).toBe("function");

      const callErr = await sendEmailTool!.execute!({}).catch((e: unknown) => e);
      expect(callErr).toBeInstanceOf(Error);
      expect((callErr as Error).message).toContain("permission error");
      expect(cb.events).toHaveLength(1);
      expect(cb.events[0].name).toBe("mcp.needs_reconsent");
      expect(cb.events[0].attributes?.["mcp.server_id"]).toBe("gmail");
    });
  });
});
