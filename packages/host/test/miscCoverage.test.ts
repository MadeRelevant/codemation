/**
 * Targeted micro-tests to cover single missed branches across small utility files.
 * Each describe block covers exactly the missed line(s) from the coverage report.
 */
import { describe, expect, it } from "vitest";

import { AssertionResultGuard } from "../src/application/runs/AssertionResultGuard";
import { TelemetryPrivacyPolicy } from "../src/application/telemetry/TelemetryPrivacyPolicy";
import { GetWorkflowSummariesQueryHandler } from "../src/application/queries/GetWorkflowSummariesQueryHandler";
import { GetWorkflowSummariesQuery } from "../src/application/queries/GetWorkflowSummariesQuery";
import { CollectionSchemaSyncerHolder } from "../src/infrastructure/collections/CollectionSchemaSyncerHolder";
import { CollectionStoreRegistry } from "../src/infrastructure/collections/CollectionStoreRegistry";
import { OtelIdentityFactory } from "../src/application/telemetry/OtelIdentityFactory";
import { InMemoryTelemetryArtifactStore } from "../src/infrastructure/persistence/InMemoryTelemetryArtifactStore";
import { CredentialTypeRegistryImpl } from "../src/domain/credentials/CredentialTypeRegistryImpl";
import { FakeLoggerFactory } from "./testkit/LoggerTestKit";
import { WebhookEndpointPathValidator } from "../src/application/workflows/WebhookEndpointPathValidator";
import { BinaryBodyNodeReadableFactory } from "../src/infrastructure/binary/BinaryBodyNodeReadableFactory";
import { WorkflowDefinitionRepositoryAdapter } from "../src/infrastructure/persistence/WorkflowDefinitionRepositoryAdapter";
import { PublicFrontendBootstrapFactory } from "../src/presentation/frontend/PublicFrontendBootstrapFactory";
import { InMemoryCommandBus } from "../src/infrastructure/di/InMemoryCommandBus";
import { InMemoryQueryBus } from "../src/infrastructure/di/InMemoryQueryBus";
import { DeleteCollectionRowCommandHandler } from "../src/application/collections/DeleteCollectionRowCommandHandler";
import { DeleteCollectionRowCommand } from "../src/application/collections/DeleteCollectionRowCommand";
import { InsertCollectionRowCommandHandler } from "../src/application/collections/InsertCollectionRowCommandHandler";
import { InsertCollectionRowCommand } from "../src/application/collections/InsertCollectionRowCommand";
import { GetCollectionRowQueryHandler } from "../src/application/collections/GetCollectionRowQueryHandler";
import { GetCollectionRowQuery } from "../src/application/collections/GetCollectionRowQuery";
import { SyncCollectionsCommandHandler } from "../src/application/collections/SyncCollectionsCommandHandler";
import { SyncCollectionsCommand } from "../src/application/collections/SyncCollectionsCommand";
import { ListCollectionRowsQueryHandler } from "../src/application/collections/ListCollectionRowsQueryHandler";
import { ListCollectionRowsQuery } from "../src/application/collections/ListCollectionRowsQuery";
import { UpdateCollectionRowCommandHandler } from "../src/application/collections/UpdateCollectionRowCommandHandler";
import { UpdateCollectionRowCommand } from "../src/application/collections/UpdateCollectionRowCommand";
import { GetCollectionQueryHandler } from "../src/application/collections/GetCollectionQueryHandler";
import { GetCollectionQuery } from "../src/application/collections/GetCollectionQuery";
import { ReplaceWorkflowDebuggerOverlayCommandHandler } from "../src/application/commands/ReplaceWorkflowDebuggerOverlayCommandHandler";
import { ReplaceWorkflowDebuggerOverlayCommand } from "../src/application/commands/ReplaceWorkflowDebuggerOverlayCommand";
import { RuntimeWorkflowActivationPolicy } from "../src/infrastructure/persistence/RuntimeWorkflowActivationPolicy";
import { CollectionStoreRegistryBuilderFactory } from "../src/infrastructure/collections/CollectionStoreRegistryBuilderFactory";

// ---------------------------------------------------------------------------
// AssertionResultGuard — line 24: return false when passThreshold is invalid
// ---------------------------------------------------------------------------
describe("AssertionResultGuard.isAssertionResult — passThreshold invalid", () => {
  const guard = new AssertionResultGuard();

  it("returns false when passThreshold is not a number", () => {
    expect(guard.isAssertionResult({ name: "test", score: 0.8, passThreshold: "not-a-number" })).toBe(false);
  });

  it("returns false when passThreshold is NaN", () => {
    expect(guard.isAssertionResult({ name: "test", score: 0.8, passThreshold: Number.NaN })).toBe(false);
  });

  it("returns false when errored is set to a non-true value", () => {
    expect(guard.isAssertionResult({ name: "test", score: 0.8, errored: false })).toBe(false);
  });

  it("returns true when errored is true", () => {
    expect(guard.isAssertionResult({ name: "test", score: 0.8, errored: true })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TelemetryPrivacyPolicy — line 17: long value branch
// ---------------------------------------------------------------------------
describe("TelemetryPrivacyPolicy.trimPreviewText — long text", () => {
  const policy = new TelemetryPrivacyPolicy();

  it("trims text longer than 1000 chars", () => {
    const longText = "a".repeat(1500);
    const result = policy.trimPreviewText(longText);
    expect(result).toHaveLength(1000);
  });

  it("returns text as-is when shorter than limit", () => {
    const shortText = "hello";
    expect(policy.trimPreviewText(shortText)).toBe("hello");
  });

  it("returns undefined for undefined input (falsy)", () => {
    expect(policy.trimPreviewText(undefined)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// GetWorkflowSummariesQueryHandler — lines 20-21: execute returns workflow list
// ---------------------------------------------------------------------------
describe("GetWorkflowSummariesQueryHandler.execute", () => {
  it("returns all workflows from the repository", async () => {
    const workflows = [{ id: "wf-1", name: "Workflow 1", nodes: [], edges: [], triggers: [] } as never];
    const repo = { list: () => workflows };
    const handler = new GetWorkflowSummariesQueryHandler(repo as never);
    const result = await handler.execute(new GetWorkflowSummariesQuery());
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("wf-1");
  });

  it("returns empty array when no workflows registered", async () => {
    const repo = { list: () => [] };
    const handler = new GetWorkflowSummariesQueryHandler(repo as never);
    const result = await handler.execute(new GetWorkflowSummariesQuery());
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// CollectionSchemaSyncerHolder — line 20: hasSync returns true with syncer
// ---------------------------------------------------------------------------
describe("CollectionSchemaSyncerHolder", () => {
  it("hasSync returns false when syncer is null", () => {
    const holder = new CollectionSchemaSyncerHolder(null);
    expect(holder.hasSync()).toBe(false);
  });

  it("hasSync returns true when syncer is provided", () => {
    const fakeSyncer = { sync: async () => ({ planned: [], applied: [] }) } as never;
    const holder = new CollectionSchemaSyncerHolder(fakeSyncer);
    expect(holder.hasSync()).toBe(true);
  });

  it("syncIfAvailable returns null when no syncer", async () => {
    const holder = new CollectionSchemaSyncerHolder(null);
    const result = await holder.syncIfAvailable();
    expect(result).toBeNull();
  });

  it("syncIfAvailable delegates to syncer when available", async () => {
    const fakeSyncer = { sync: async () => ({ planned: ["a"], applied: ["a"] }) } as never;
    const holder = new CollectionSchemaSyncerHolder(fakeSyncer);
    const result = await holder.syncIfAvailable();
    expect(result).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// CollectionStoreRegistry — line 22: names() returns store keys
// ---------------------------------------------------------------------------
describe("CollectionStoreRegistry", () => {
  it("names returns all registered collection names", () => {
    const registry = new CollectionStoreRegistry(
      new Map([
        ["users", {} as never],
        ["posts", {} as never],
      ]),
    );
    const names = registry.names();
    expect(names).toContain("users");
    expect(names).toContain("posts");
    expect(names).toHaveLength(2);
  });

  it("get returns undefined for unknown collection", () => {
    const registry = new CollectionStoreRegistry(new Map());
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("toRecord converts to plain object", () => {
    const store = { findMany: async () => [] } as never;
    const registry = new CollectionStoreRegistry(new Map([["items", store]]));
    const record = registry.toRecord();
    expect(record.items).toBe(store);
  });
});

// ---------------------------------------------------------------------------
// OtelIdentityFactory — line 19: createConnectionInvocationSpanId
// ---------------------------------------------------------------------------
describe("OtelIdentityFactory.createConnectionInvocationSpanId", () => {
  it("returns a 16-char hex string for an invocation id", () => {
    const factory = new OtelIdentityFactory();
    const spanId = factory.createConnectionInvocationSpanId("inv-123");
    expect(spanId).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ---------------------------------------------------------------------------
// InMemoryTelemetryArtifactStore — pruneExpired removes expired records
// ---------------------------------------------------------------------------
describe("InMemoryTelemetryArtifactStore.pruneExpired", () => {
  it("removes expired artifacts and returns count + empty storage keys when none set", async () => {
    const otel = new OtelIdentityFactory();
    const store = new InMemoryTelemetryArtifactStore(otel);
    await store.save({
      traceId: "trace-1",
      spanId: "span-1",
      runId: "run-1",
      workflowId: "wf-1",
      kind: "input",
      contentType: "text/plain",
      retentionExpiresAt: "2026-01-01T00:00:00.000Z",
    });
    await store.save({
      traceId: "trace-2",
      spanId: "span-2",
      runId: "run-1",
      workflowId: "wf-1",
      kind: "output",
      contentType: "text/plain",
      retentionExpiresAt: "2026-12-31T00:00:00.000Z",
    });
    const result = await store.pruneExpired({ nowIso: "2026-06-01T00:00:00.000Z" });
    expect(result.count).toBe(1);
    // Only the expired artifact was removed
    const remaining = await store.listByTraceId("trace-2");
    expect(remaining).toHaveLength(1);
  });

  it("pruneExpired with limit stops at limit", async () => {
    const otel = new OtelIdentityFactory();
    const store = new InMemoryTelemetryArtifactStore(otel);
    for (let i = 0; i < 3; i++) {
      await store.save({
        traceId: `trace-${i}`,
        spanId: `span-${i}`,
        runId: "run-1",
        workflowId: "wf-1",
        kind: "input",
        contentType: "text/plain",
        retentionExpiresAt: "2026-01-01T00:00:00.000Z",
      });
    }
    const result = await store.pruneExpired({ nowIso: "2026-06-01T00:00:00.000Z", limit: 1 });
    expect(result.count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// CredentialTypeRegistryImpl — line 13: throw when already registered
// ---------------------------------------------------------------------------
describe("CredentialTypeRegistryImpl", () => {
  it("throws when registering a duplicate typeId", () => {
    const registry = new CredentialTypeRegistryImpl(new FakeLoggerFactory());
    const type = {
      definition: {
        typeId: "test.cred",
        displayName: "Test",
        publicFields: [],
        secretFields: [],
        supportedSourceKinds: ["db"],
      },
      createSession: async () => ({}),
      test: async () => ({ ok: true }),
    } as never;
    registry.register(type);
    expect(() => registry.register(type)).toThrow(/already registered/);
  });

  it("getType returns undefined for unknown typeId", () => {
    const registry = new CredentialTypeRegistryImpl(new FakeLoggerFactory());
    expect(registry.getType("nonexistent" as never)).toBeUndefined();
  });

  it("listTypes returns all registered type definitions", () => {
    const registry = new CredentialTypeRegistryImpl(new FakeLoggerFactory());
    const type = {
      definition: {
        typeId: "test.cred2",
        displayName: "Test2",
        publicFields: [],
        secretFields: [],
        supportedSourceKinds: ["db"],
      },
      createSession: async () => ({}),
    } as never;
    registry.register(type);
    const types = registry.listTypes();
    expect(types).toHaveLength(1);
    expect(types[0].typeId).toBe("test.cred2");
  });
});

// ---------------------------------------------------------------------------
// WebhookEndpointPathValidator — lines 23, 28: dot and slash warnings
// ---------------------------------------------------------------------------
describe("WebhookEndpointPathValidator.validateAndWarn", () => {
  it("warns when endpoint key contains a dot", () => {
    const warnings: string[] = [];
    const loggerFactory = {
      create: () => ({
        warn: (msg: string) => warnings.push(msg),
        info: () => {},
        debug: () => {},
        error: () => {},
      }),
    };
    const validator = new WebhookEndpointPathValidator(loggerFactory as never);
    validator.validateAndWarn([
      {
        id: "wf-1",
        nodes: [{ id: "n1", kind: "trigger", config: { endpointKey: "my.webhook" } } as never],
        edges: [],
        triggers: [],
      } as never,
    ]);
    expect(warnings.some((w) => w.includes("dot"))).toBe(true);
  });

  it("warns when endpoint key contains a slash", () => {
    const warnings: string[] = [];
    const loggerFactory = {
      create: () => ({
        warn: (msg: string) => warnings.push(msg),
        info: () => {},
        debug: () => {},
        error: () => {},
      }),
    };
    const validator = new WebhookEndpointPathValidator(loggerFactory as never);
    validator.validateAndWarn([
      {
        id: "wf-1",
        nodes: [{ id: "n1", kind: "trigger", config: { endpointKey: "my/webhook" } } as never],
        edges: [],
        triggers: [],
      } as never,
    ]);
    expect(warnings.some((w) => w.includes("slash") || w.includes("/"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// BinaryBodyNodeReadableFactory — lines 15 (ArrayBuffer) and 20 (fallback)
// ---------------------------------------------------------------------------
describe("BinaryBodyNodeReadableFactory.create", () => {
  it("creates a readable from ArrayBuffer", () => {
    const buf = new ArrayBuffer(4);
    const factory = new BinaryBodyNodeReadableFactory(buf);
    const readable = factory.create();
    expect(readable).toBeDefined();
    expect(typeof readable.read).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// WorkflowDefinitionRepositoryAdapter — lines 14 (listDefinitions) and 24 (resolveSnapshot)
// ---------------------------------------------------------------------------
describe("WorkflowDefinitionRepositoryAdapter", () => {
  const makeAdapter = () => {
    const workflows = [{ id: "wf-1" }];
    const workflowRepo = {
      list: () => workflows as never[],
      get: (id: string) => workflows.find((w) => w.id === id) as never,
    };
    const engine = {
      resolveWorkflowSnapshot: async (args: { workflowId: string }) => ({ id: args.workflowId }) as never,
    };
    return new WorkflowDefinitionRepositoryAdapter(engine as never, workflowRepo as never);
  };

  it("listDefinitions returns all workflows", async () => {
    const adapter = makeAdapter();
    const result = await adapter.listDefinitions();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("wf-1");
  });

  it("resolveSnapshot delegates to engine.resolveWorkflowSnapshot", async () => {
    const adapter = makeAdapter();
    const result = await adapter.resolveSnapshot({ workflowId: "wf-1" });
    expect(result).toBeDefined();
    expect(result!.id).toBe("wf-1");
  });
});

// ---------------------------------------------------------------------------
// PublicFrontendBootstrapFactory — line 23: cpWebOrigin branch
// ---------------------------------------------------------------------------
describe("PublicFrontendBootstrapFactory.create — cpWebOrigin branch", () => {
  it("includes cpWebOrigin when frontendAppConfig has it", () => {
    const frontendAppConfig = {
      auth: {
        credentialsEnabled: true,
        oauthProviders: [],
        uiAuthEnabled: true,
        cpWebOrigin: "https://cp.example.com",
      },
      logoUrl: null,
      productName: "TestApp",
    };
    const factory = new PublicFrontendBootstrapFactory({
      create: () => frontendAppConfig,
    } as never);
    const bootstrap = factory.create();
    expect(bootstrap.cpWebOrigin).toBe("https://cp.example.com");
  });
});

// ---------------------------------------------------------------------------
// InMemoryCommandBus — line 24: throw when no handler registered
// ---------------------------------------------------------------------------
describe("InMemoryCommandBus", () => {
  it("throws when no handler is registered for the command type", async () => {
    const bus = new InMemoryCommandBus([]);
    const fakeCmd = Object.create({ constructor: class UnknownCmd {} }) as never;
    await expect(bus.execute(fakeCmd)).rejects.toThrow(/No command handler/);
  });
});

// ---------------------------------------------------------------------------
// InMemoryQueryBus — line 24: throw when no handler registered
// ---------------------------------------------------------------------------
describe("InMemoryQueryBus", () => {
  it("throws when no handler is registered for the query type", async () => {
    const bus = new InMemoryQueryBus([]);
    const fakeQuery = Object.create({ constructor: class UnknownQuery {} }) as never;
    await expect(bus.execute(fakeQuery)).rejects.toThrow(/No query handler/);
  });
});

// ---------------------------------------------------------------------------
// SyncCollectionsCommandHandler — line 20: return zero counts when no syncer
// ---------------------------------------------------------------------------
describe("SyncCollectionsCommandHandler.execute — no syncer", () => {
  it("returns 0 counts when syncer is not available", async () => {
    const holder = new CollectionSchemaSyncerHolder(null);
    const handler = new SyncCollectionsCommandHandler(holder as never);
    const result = await handler.execute(new SyncCollectionsCommand(false));
    expect(result.planned).toBe(0);
    expect(result.applied).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Collection row command handlers — "store not found" error paths
// ---------------------------------------------------------------------------
function makeCollectionRegistry(names: string[]): object {
  return { has: (name: string) => names.includes(name) };
}

function makeStoreRegistry(storeName: string | null): object {
  return { get: (name: string) => (name === storeName ? {} : undefined) };
}

describe("DeleteCollectionRowCommandHandler", () => {
  it("throws 404 when collection not found", async () => {
    const handler = new DeleteCollectionRowCommandHandler(
      makeCollectionRegistry([]) as never,
      makeStoreRegistry(null) as never,
    );
    await expect(handler.execute(new DeleteCollectionRowCommand("items", "row-1"))).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 404 when store not available", async () => {
    const handler = new DeleteCollectionRowCommandHandler(
      makeCollectionRegistry(["items"]) as never,
      makeStoreRegistry(null) as never,
    );
    await expect(handler.execute(new DeleteCollectionRowCommand("items", "row-1"))).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("InsertCollectionRowCommandHandler", () => {
  it("throws 404 when collection not found", async () => {
    const handler = new InsertCollectionRowCommandHandler(
      makeCollectionRegistry([]) as never,
      makeStoreRegistry(null) as never,
    );
    await expect(handler.execute(new InsertCollectionRowCommand("items", { name: "Alice" }))).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 404 when store not available", async () => {
    const handler = new InsertCollectionRowCommandHandler(
      makeCollectionRegistry(["items"]) as never,
      makeStoreRegistry(null) as never,
    );
    await expect(handler.execute(new InsertCollectionRowCommand("items", { name: "Alice" }))).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("GetCollectionRowQueryHandler", () => {
  it("throws 404 when collection not found", async () => {
    const handler = new GetCollectionRowQueryHandler(
      makeCollectionRegistry([]) as never,
      makeStoreRegistry(null) as never,
    );
    await expect(handler.execute(new GetCollectionRowQuery("items", "row-1"))).rejects.toMatchObject({ status: 404 });
  });

  it("throws 404 when store not available", async () => {
    const handler = new GetCollectionRowQueryHandler(
      makeCollectionRegistry(["items"]) as never,
      makeStoreRegistry(null) as never,
    );
    await expect(handler.execute(new GetCollectionRowQuery("items", "row-1"))).rejects.toMatchObject({ status: 404 });
  });

  it("returns null when row not found", async () => {
    const store = { get: async () => undefined };
    const registry = { get: () => store };
    const handler = new GetCollectionRowQueryHandler(makeCollectionRegistry(["items"]) as never, registry as never);
    const result = await handler.execute(new GetCollectionRowQuery("items", "row-missing"));
    expect(result).toBeNull();
  });
});

describe("ListCollectionRowsQueryHandler", () => {
  it("throws 404 when collection not found", async () => {
    const handler = new ListCollectionRowsQueryHandler(
      makeCollectionRegistry([]) as never,
      makeStoreRegistry(null) as never,
    );
    await expect(handler.execute(new ListCollectionRowsQuery("items", 50, 0))).rejects.toMatchObject({ status: 404 });
  });

  it("throws 404 when store not available", async () => {
    const handler = new ListCollectionRowsQueryHandler(
      makeCollectionRegistry(["items"]) as never,
      makeStoreRegistry(null) as never,
    );
    await expect(handler.execute(new ListCollectionRowsQuery("items", 50, 0))).rejects.toMatchObject({ status: 404 });
  });
});

describe("UpdateCollectionRowCommandHandler", () => {
  it("throws 404 when collection not found", async () => {
    const handler = new UpdateCollectionRowCommandHandler(
      makeCollectionRegistry([]) as never,
      makeStoreRegistry(null) as never,
    );
    await expect(handler.execute(new UpdateCollectionRowCommand("items", "row-1", {}))).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 404 when store not available", async () => {
    const handler = new UpdateCollectionRowCommandHandler(
      makeCollectionRegistry(["items"]) as never,
      makeStoreRegistry(null) as never,
    );
    await expect(handler.execute(new UpdateCollectionRowCommand("items", "row-1", {}))).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("GetCollectionQueryHandler", () => {
  it("returns detail including indexes when definition has indexes", async () => {
    const def = {
      name: "users",
      fields: { email: { type: "string", nullable: false, default: undefined } },
      indexes: [{ on: ["email"], unique: true }],
    };
    const registry = { resolve: () => def };
    const handler = new GetCollectionQueryHandler(registry as never);
    const result = await handler.execute(new GetCollectionQuery("users"));
    expect(result).toBeDefined();
    expect(result!.indexes).toHaveLength(1);
    expect(result!.indexes[0].unique).toBe(true);
  });

  it("returns null when collection not found", async () => {
    const registry = { resolve: () => undefined };
    const handler = new GetCollectionQueryHandler(registry as never);
    const result = await handler.execute(new GetCollectionQuery("nonexistent"));
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ReplaceWorkflowDebuggerOverlayCommandHandler — line 26: throw when no currentState
// ---------------------------------------------------------------------------
describe("ReplaceWorkflowDebuggerOverlayCommandHandler", () => {
  it("throws 400 when currentState is missing", async () => {
    const repo = { save: async () => undefined, load: async () => undefined };
    const handler = new ReplaceWorkflowDebuggerOverlayCommandHandler(repo as never);
    const cmd = new ReplaceWorkflowDebuggerOverlayCommand("wf-1", { currentState: undefined });
    await expect(handler.execute(cmd)).rejects.toMatchObject({ status: 400 });
  });
});

// ---------------------------------------------------------------------------
// RuntimeWorkflowActivationPolicy — line 16: hydrateFromRepository sets values
// ---------------------------------------------------------------------------
describe("RuntimeWorkflowActivationPolicy.hydrateFromRepository", () => {
  it("populates the activation map from repository rows", async () => {
    const policy = new RuntimeWorkflowActivationPolicy();
    const repo = {
      loadAll: async () => [
        { workflowId: "wf-1", isActive: true },
        { workflowId: "wf-2", isActive: false },
      ],
    };
    await policy.hydrateFromRepository(repo as never);
    expect(policy.isActive("wf-1")).toBe(true);
    expect(policy.isActive("wf-2")).toBe(false);
    expect(policy.isActive("wf-unknown")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CollectionStoreRegistryBuilderFactory — line 26: kind=none returns empty registry
// ---------------------------------------------------------------------------
describe("CollectionStoreRegistryBuilderFactory.create — kind=none", () => {
  it("returns an empty registry when persistence kind is none", () => {
    const registry = CollectionStoreRegistryBuilderFactory.create(
      { persistence: { kind: "none" }, env: {}, collections: [] } as never,
      { list: () => [] } as never,
      {} as never,
    );
    expect(registry.names()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// InMemoryCommandBus — line 38: missing metadata error path
// ---------------------------------------------------------------------------
describe("InMemoryCommandBus constructor validation", () => {
  it("throws when a handler is missing @HandlesCommand metadata", () => {
    // Use a plain object where constructor has no Reflect metadata
    class NoMetaHandler {}
    const handler = Object.create({ constructor: NoMetaHandler }) as never;
    expect(() => new InMemoryCommandBus([handler])).toThrow(/missing @HandlesCommand/);
  });
});

// ---------------------------------------------------------------------------
// InMemoryQueryBus — line 36: missing metadata error path
// ---------------------------------------------------------------------------
describe("InMemoryQueryBus constructor validation", () => {
  it("throws when a handler is missing @HandlesQuery metadata", () => {
    class NoMetaQueryHandler {}
    const handler = Object.create({ constructor: NoMetaQueryHandler }) as never;
    expect(() => new InMemoryQueryBus([handler])).toThrow(/missing @HandlesQuery/);
  });
});
