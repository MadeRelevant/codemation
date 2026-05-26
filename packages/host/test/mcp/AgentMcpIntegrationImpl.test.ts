import { describe, expect, it } from "vitest";
import type { ConnectionInvocationAppendArgs, McpServerDeclaration, TelemetrySpanEventRecord } from "@codemation/core";
import { AgentBindError, ConnectionNodeIdFactory } from "@codemation/core";
import { AgentMcpIntegrationImpl } from "../../src/mcp/AgentMcpIntegrationImpl";
import { McpServerCatalog } from "../../src/mcp/McpServerCatalog";
import { McpConnectionPool } from "../../src/mcp/McpConnectionPool";
import type { LoggerFactory } from "../../src/application/logging/Logger";
import type { CredentialStore } from "../../src/domain/credentials/CredentialServices";
import type { CredentialInstanceRecord } from "../../src/domain/credentials/CredentialServices";
import type { CredentialOAuth2MaterialReader } from "../../src/credentials/CredentialOAuth2MaterialReader";
import { FakeLoggerFactory, makeAppConfig } from "../testkit";
import { FakeMcpClient, FakeClientFactory, FakeOAuth2MaterialReader } from "./testkit/McpTestKit";

const WORKFLOW_ID = "wf.test";
const AGENT_NODE_ID = "agent-1";
const GMAIL_MCP_NODE_ID = ConnectionNodeIdFactory.mcpConnectionNodeId(AGENT_NODE_ID, "gmail");

function makeCatalog(declarations: McpServerDeclaration[]): McpServerCatalog {
  const catalog = new McpServerCatalog(new FakeLoggerFactory() as unknown as LoggerFactory, makeAppConfig());
  catalog.merge("config", declarations);
  return catalog;
}

function makeCredentialStore(
  instances: Partial<CredentialInstanceRecord>[],
  bindings: ReadonlyArray<Readonly<{ workflowId: string; nodeId: string; slotKey: string; instanceId: string }>> = [],
): CredentialStore {
  const instanceMap = new Map(
    instances.map((inst) => [
      inst.instanceId ?? "default-id",
      {
        instanceId: inst.instanceId ?? "default-id",
        typeId: "oauth.google.gmail",
        displayName: inst.displayName ?? "Test Credential",
        sourceKind: "db" as const,
        publicConfig: inst.publicConfig ?? {},
        secretRef: { kind: "db" as const },
        tags: [],
        setupStatus: "ready" as const,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        material: { source: "local" as const, ref: inst.instanceId ?? "default-id" },
      } satisfies CredentialInstanceRecord,
    ]),
  );

  const bindingsByKey = new Map(
    bindings.map((b) => [
      `${b.workflowId}\0${b.nodeId}\0${b.slotKey}`,
      {
        key: { workflowId: b.workflowId, nodeId: b.nodeId, slotKey: b.slotKey },
        instanceId: b.instanceId,
        updatedAt: "2024-01-01T00:00:00Z",
      },
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
    getBinding: async (key) => bindingsByKey.get(`${key.workflowId}\0${key.nodeId}\0${key.slotKey}`),
    listBindingsByWorkflowId: async () => [],
    saveTestResult: async () => {},
    getLatestTestResult: async () => undefined,
    getLatestTestResults: async () => new Map(),
  } satisfies CredentialStore;
}

function makePool(catalog: McpServerCatalog): McpConnectionPool {
  const factory = new FakeClientFactory();
  return new McpConnectionPool(
    catalog,
    new FakeOAuth2MaterialReader() as unknown as CredentialOAuth2MaterialReader,
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
};

// --- Tests ---

describe("AgentMcpIntegrationImpl", () => {
  describe("binding resolution from CredentialBinding", () => {
    it("resolves the binding at (workflowId, mcpConnectionNodeId, 'credential') and returns a tool map", async () => {
      const catalog = makeCatalog([gmailDecl]);
      const getBindingCalls: Array<Readonly<{ workflowId: string; nodeId: string; slotKey: string }>> = [];
      const baseStore = makeCredentialStore(
        [
          {
            instanceId: "cred-1",
            scopes: ["https://mail.google.com/"],
          } as any,
        ],
        [
          {
            workflowId: WORKFLOW_ID,
            nodeId: GMAIL_MCP_NODE_ID,
            slotKey: "credential",
            instanceId: "cred-1",
          },
        ],
      );
      const store: typeof baseStore = {
        ...baseStore,
        getBinding: async (key) => {
          getBindingCalls.push(key);
          return baseStore.getBinding(key);
        },
      };
      const pool = makePool(catalog);

      const integration = new AgentMcpIntegrationImpl(catalog, pool, store, new FakeLoggerFactory());
      const cb = makeNoopSpanCallbacks();

      const result = await integration.prepareMcpTools({
        workflowId: WORKFLOW_ID,
        agentNodeId: AGENT_NODE_ID,
        serverIds: ["gmail"],
        pinnedMcpTools: [],
        emitSpanEvent: cb.emitSpanEvent,
        startChildSpan: cb.startChildSpan,
      });

      expect(result.has("gmail")).toBe(true);
      expect(getBindingCalls).toEqual([{ workflowId: WORKFLOW_ID, nodeId: GMAIL_MCP_NODE_ID, slotKey: "credential" }]);
    });

    it("throws AgentBindError when no binding exists for the MCP connection node", async () => {
      const catalog = makeCatalog([gmailDecl]);
      const store = makeCredentialStore([{ instanceId: "cred-1" }], []);
      const pool = makePool(catalog);
      const integration = new AgentMcpIntegrationImpl(catalog, pool, store, new FakeLoggerFactory());
      const cb = makeNoopSpanCallbacks();

      await expect(
        integration.prepareMcpTools({
          workflowId: WORKFLOW_ID,
          agentNodeId: AGENT_NODE_ID,
          serverIds: ["gmail"],
          pinnedMcpTools: [],
          emitSpanEvent: cb.emitSpanEvent,
          startChildSpan: cb.startChildSpan,
        }),
      ).rejects.toThrow(AgentBindError);
    });

    it("throws AgentBindError when the bound credential instance no longer exists", async () => {
      const catalog = makeCatalog([gmailDecl]);
      const store = makeCredentialStore(
        [],
        [
          {
            workflowId: WORKFLOW_ID,
            nodeId: GMAIL_MCP_NODE_ID,
            slotKey: "credential",
            instanceId: "missing-cred",
          },
        ],
      );
      const pool = makePool(catalog);
      const integration = new AgentMcpIntegrationImpl(catalog, pool, store, new FakeLoggerFactory());
      const cb = makeNoopSpanCallbacks();

      await expect(
        integration.prepareMcpTools({
          workflowId: WORKFLOW_ID,
          agentNodeId: AGENT_NODE_ID,
          serverIds: ["gmail"],
          pinnedMcpTools: [],
          emitSpanEvent: cb.emitSpanEvent,
          startChildSpan: cb.startChildSpan,
        }),
      ).rejects.toThrow(AgentBindError);
    });

    it("throws AgentBindError when server is not in catalog", async () => {
      const catalog = makeCatalog([]);
      const store = makeCredentialStore([{ instanceId: "cred-1", publicConfig: {} }]);
      const pool = makePool(catalog);
      const integration = new AgentMcpIntegrationImpl(catalog, pool, store, new FakeLoggerFactory());
      const cb = makeNoopSpanCallbacks();

      await expect(
        integration.prepareMcpTools({
          workflowId: WORKFLOW_ID,
          agentNodeId: AGENT_NODE_ID,
          serverIds: ["gmail"],
          pinnedMcpTools: [],
          emitSpanEvent: cb.emitSpanEvent,
          startChildSpan: cb.startChildSpan,
        }),
      ).rejects.toThrow(AgentBindError);
    });
  });

  describe("bind-time scope validation", () => {
    it("passes when credential scopes cover requiredScopes", async () => {
      const declWithScopes: McpServerDeclaration = {
        ...gmailDecl,
        requiredScopes: ["https://mail.google.com/"],
      };
      const catalog = makeCatalog([declWithScopes]);
      const store = makeCredentialStore(
        [
          {
            instanceId: "cred-1",
            scopes: ["https://mail.google.com/", "https://www.googleapis.com/auth/userinfo.email"],
          } as any,
        ],
        [
          {
            workflowId: WORKFLOW_ID,
            nodeId: GMAIL_MCP_NODE_ID,
            slotKey: "credential",
            instanceId: "cred-1",
          },
        ],
      );
      const pool = makePool(catalog);
      const integration = new AgentMcpIntegrationImpl(catalog, pool, store, new FakeLoggerFactory());
      const cb = makeNoopSpanCallbacks();

      await expect(
        integration.prepareMcpTools({
          workflowId: WORKFLOW_ID,
          agentNodeId: AGENT_NODE_ID,
          serverIds: ["gmail"],
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
      const store = makeCredentialStore(
        [
          {
            instanceId: "cred-1",
            scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
          } as any,
        ],
        [
          {
            workflowId: WORKFLOW_ID,
            nodeId: GMAIL_MCP_NODE_ID,
            slotKey: "credential",
            instanceId: "cred-1",
          },
        ],
      );
      const pool = makePool(catalog);
      const integration = new AgentMcpIntegrationImpl(catalog, pool, store, new FakeLoggerFactory());
      const cb = makeNoopSpanCallbacks();

      const err = await integration
        .prepareMcpTools({
          workflowId: WORKFLOW_ID,
          agentNodeId: AGENT_NODE_ID,
          serverIds: ["gmail"],
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
      const store = makeCredentialStore(
        [{ instanceId: "cred-1", scopes: [] } as any],
        [
          {
            workflowId: WORKFLOW_ID,
            nodeId: GMAIL_MCP_NODE_ID,
            slotKey: "credential",
            instanceId: "cred-1",
          },
        ],
      );

      // Pre-seed the client with a successful tool so we get a real span on execute.
      const seededClient = new FakeMcpClient();
      seededClient.toolsResult["list_messages"] = {
        description: "List messages",
        execute: async () => ({ messages: [] }),
      };

      const clientFactory = new FakeClientFactory(seededClient);
      const pool = new McpConnectionPool(
        catalog,
        new FakeOAuth2MaterialReader() as unknown as CredentialOAuth2MaterialReader,
        new FakeLoggerFactory(),
        clientFactory,
      );

      const integration = new AgentMcpIntegrationImpl(catalog, pool, store, new FakeLoggerFactory());
      const cb = makeNoopSpanCallbacks();

      const result = await integration.prepareMcpTools({
        workflowId: WORKFLOW_ID,
        agentNodeId: AGENT_NODE_ID,
        serverIds: ["gmail"],
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
      const store = makeCredentialStore(
        [{ instanceId: "cred-1", scopes: [] } as any],
        [
          {
            workflowId: WORKFLOW_ID,
            nodeId: GMAIL_MCP_NODE_ID,
            slotKey: "credential",
            instanceId: "cred-1",
          },
        ],
      );

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
        new FakeOAuth2MaterialReader() as unknown as CredentialOAuth2MaterialReader,
        new FakeLoggerFactory(),
        clientFactory,
      );

      const integration = new AgentMcpIntegrationImpl(catalog, pool, store, new FakeLoggerFactory());
      const cb = makeNoopSpanCallbacks();

      const result = await integration.prepareMcpTools({
        workflowId: WORKFLOW_ID,
        agentNodeId: AGENT_NODE_ID,
        serverIds: ["gmail"],
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

  describe("per-tool invocation lifecycle", () => {
    function makeAppendCapture() {
      const calls: ConnectionInvocationAppendArgs[] = [];
      return {
        calls,
        append: async (args: ConnectionInvocationAppendArgs) => {
          calls.push(args);
        },
      };
    }

    function setupSeededIntegration(toolName: string, execute: () => Promise<unknown>) {
      const catalog = makeCatalog([gmailDecl]);
      const store = makeCredentialStore(
        [{ instanceId: "cred-1", scopes: [] } as any],
        [
          {
            workflowId: WORKFLOW_ID,
            nodeId: GMAIL_MCP_NODE_ID,
            slotKey: "credential",
            instanceId: "cred-1",
          },
        ],
      );
      const seededClient = new FakeMcpClient();
      seededClient.toolsResult[toolName] = {
        description: "Test tool",
        execute,
      };
      const clientFactory = new FakeClientFactory(seededClient);
      const pool = new McpConnectionPool(
        catalog,
        new FakeOAuth2MaterialReader() as unknown as CredentialOAuth2MaterialReader,
        new FakeLoggerFactory(),
        clientFactory,
      );
      return new AgentMcpIntegrationImpl(catalog, pool, store, new FakeLoggerFactory());
    }

    it("emits a running invocation with statusLabel=`calling <toolName>` then completed on success", async () => {
      const integration = setupSeededIntegration("list_messages", async () => ({ messages: [] }));
      const cb = makeNoopSpanCallbacks();
      const capture = makeAppendCapture();

      const result = await integration.prepareMcpTools({
        workflowId: WORKFLOW_ID,
        agentNodeId: AGENT_NODE_ID,
        serverIds: ["gmail"],
        pinnedMcpTools: [],
        emitSpanEvent: cb.emitSpanEvent,
        startChildSpan: cb.startChildSpan,
        appendMcpInvocation: capture.append,
        parentAgentActivationId: "act-1",
      });
      const tool = result.get("gmail")?.["list_messages"] as { execute: (input: unknown) => Promise<unknown> };
      await tool.execute({ q: "test" });

      expect(capture.calls).toHaveLength(2);
      const [running, completed] = capture.calls;
      expect(running.status).toBe("running");
      expect(completed.status).toBe("completed");
      expect(running.statusLabel).toBe("calling list_messages");
      expect(running.subjectName).toBe("list_messages");
      expect(completed.subjectName).toBe("list_messages");
      expect(running.invocationId).toBe(completed.invocationId);
      expect(running.connectionNodeId).toBe(GMAIL_MCP_NODE_ID);
      expect(completed.connectionNodeId).toBe(GMAIL_MCP_NODE_ID);
      expect(running.parentAgentNodeId).toBe(AGENT_NODE_ID);
      expect(running.parentAgentActivationId).toBe("act-1");
    });

    it("emits running then failed with error.message on a non-permission error", async () => {
      const integration = setupSeededIntegration("send_email", async () => {
        throw new Error("network down");
      });
      const cb = makeNoopSpanCallbacks();
      const capture = makeAppendCapture();

      const result = await integration.prepareMcpTools({
        workflowId: WORKFLOW_ID,
        agentNodeId: AGENT_NODE_ID,
        serverIds: ["gmail"],
        pinnedMcpTools: [],
        emitSpanEvent: cb.emitSpanEvent,
        startChildSpan: cb.startChildSpan,
        appendMcpInvocation: capture.append,
        parentAgentActivationId: "act-1",
      });
      const tool = result.get("gmail")?.["send_email"] as { execute: (input: unknown) => Promise<unknown> };
      await tool.execute({}).catch(() => undefined);

      expect(capture.calls).toHaveLength(2);
      const [running, failed] = capture.calls;
      expect(running.status).toBe("running");
      expect(failed.status).toBe("failed");
      expect(failed.error?.message).toBe("network down");
      expect(running.invocationId).toBe(failed.invocationId);
    });

    it("emits failed AND a NeedsReconsentEvent on a 403/permission error", async () => {
      const integration = setupSeededIntegration("send_email", async () => {
        throw new Error("403 Forbidden");
      });
      const cb = makeNoopSpanCallbacks();
      const capture = makeAppendCapture();

      const result = await integration.prepareMcpTools({
        workflowId: WORKFLOW_ID,
        agentNodeId: AGENT_NODE_ID,
        serverIds: ["gmail"],
        pinnedMcpTools: [],
        emitSpanEvent: cb.emitSpanEvent,
        startChildSpan: cb.startChildSpan,
        appendMcpInvocation: capture.append,
        parentAgentActivationId: "act-1",
      });
      const tool = result.get("gmail")?.["send_email"] as { execute: (input: unknown) => Promise<unknown> };
      await tool.execute({}).catch(() => undefined);

      expect(capture.calls).toHaveLength(2);
      const [running, failed] = capture.calls;
      expect(running.status).toBe("running");
      expect(failed.status).toBe("failed");
      expect(failed.error?.message).toContain("permission error");
      expect(cb.events).toHaveLength(1);
      expect(cb.events[0].name).toBe("mcp.needs_reconsent");
    });
  });
});
