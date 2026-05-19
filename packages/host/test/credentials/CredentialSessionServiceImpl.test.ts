import { describe, expect, it } from "vitest";
import type { CredentialBinding } from "@codemation/core";
import { CredentialUnboundError } from "@codemation/core";
import { CredentialSessionServiceImpl } from "../../src/domain/credentials/CredentialSessionServiceImpl";
import { CredentialTypeRegistryImpl } from "../../src/domain/credentials/CredentialTypeRegistryImpl";
import { CredentialFieldEnvOverlayService } from "../../src/domain/credentials/CredentialFieldEnvOverlayService";
import type { CredentialInstanceRecord, CredentialStore } from "../../src/domain/credentials/CredentialServices";
import { makeAppConfig } from "../testkit/AppConfigFixturesFactory";

function makeInstance(instanceId: string, typeId = "test.type"): CredentialInstanceRecord {
  return {
    instanceId: instanceId as never,
    typeId: typeId as never,
    displayName: "Test",
    publicConfig: {},
    secretRef: { kind: "code", value: {} },
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as CredentialInstanceRecord;
}

function makeCredentialStore(
  bindings: Map<string, CredentialBinding>,
  instances: Map<string, CredentialInstanceRecord>,
): CredentialStore {
  return {
    listInstances: async () => [],
    getInstance: async (id) => instances.get(id),
    saveInstance: async () => undefined,
    deleteInstance: async () => undefined,
    getSecretMaterial: async () => undefined,
    createOAuth2State: async () => undefined,
    consumeOAuth2State: async () => undefined,
    getOAuth2Material: async () => undefined,
    saveOAuth2Material: async () => undefined,
    deleteOAuth2Material: async () => undefined,
    upsertBinding: async () => undefined,
    getBinding: async (key) => bindings.get(`${key.workflowId}:${key.nodeId}:${key.slotKey}`),
    listBindingsByWorkflowId: async () => [],
    saveTestResult: async () => undefined,
    getLatestTestResult: async () => undefined,
    getLatestTestResults: async () => new Map(),
  };
}

function makeRuntimeMaterialService(material: Record<string, unknown> = {}): object {
  return {
    compose: async () => material,
  };
}

function makeWorkflowRepository(workflow?: object): object {
  return {
    get: (_id: string) => workflow,
    list: () => [],
  };
}

function makeWorkflowCredentialNodeResolver(): object {
  return {
    describeCredentialNodeDisplay: () => undefined,
    findRequirement: () => undefined,
  };
}

function makeService(args: {
  bindings?: Map<string, CredentialBinding>;
  instances?: Map<string, CredentialInstanceRecord>;
  credentialTypeId?: string;
  sessionValue?: unknown;
  workflow?: object;
  displayLabel?: string;
}) {
  const bindings = args.bindings ?? new Map();
  const instances = args.instances ?? new Map();

  const credentialStore = makeCredentialStore(bindings, instances);
  const runtimeMaterialService = makeRuntimeMaterialService();
  const fieldEnvOverlayService = new CredentialFieldEnvOverlayService(makeAppConfig());
  const typeRegistry = new CredentialTypeRegistryImpl();

  if (args.credentialTypeId) {
    typeRegistry.register({
      definition: {
        typeId: args.credentialTypeId,
        displayName: "Test",
        publicFields: [],
        secretFields: [],
        supportedSourceKinds: ["code"],
      } as never,
      createSession: async () => args.sessionValue ?? { ok: true },
    } as never);
  }

  const workflowRepository = makeWorkflowRepository(args.workflow);
  const credentialNodeResolver = {
    describeCredentialNodeDisplay: () => args.displayLabel,
    findRequirement: () => undefined,
  };

  return new CredentialSessionServiceImpl(
    credentialStore as never,
    runtimeMaterialService as never,
    fieldEnvOverlayService,
    typeRegistry,
    workflowRepository as never,
    credentialNodeResolver as never,
  );
}

describe("CredentialSessionServiceImpl.getSession", () => {
  it("throws CredentialUnboundError when no binding found", async () => {
    const svc = makeService({});
    await expect(svc.getSession({ workflowId: "wf-1", nodeId: "n1", slotKey: "s" })).rejects.toBeInstanceOf(
      CredentialUnboundError,
    );
  });

  it("wraps CredentialUnboundError with display label when workflow is found and has node label", async () => {
    // No binding — will throw unbound
    const svc = makeService({ displayLabel: "MyNode credentials", workflow: {} });
    await expect(svc.getSession({ workflowId: "wf-1", nodeId: "n1", slotKey: "s" })).rejects.toSatisfy((e: Error) =>
      e.message.includes("MyNode credentials"),
    );
  });

  it("throws 404 ApplicationRequestError when credential instance is not found", async () => {
    const bindings = new Map<string, CredentialBinding>();
    bindings.set("wf-1:n1:s", {
      key: { workflowId: "wf-1", nodeId: "n1", slotKey: "s" },
      instanceId: "inst-missing",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as never);
    const svc = makeService({ bindings });
    await expect(svc.getSession({ workflowId: "wf-1", nodeId: "n1", slotKey: "s" })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 400 ApplicationRequestError when credential type is not registered", async () => {
    const bindings = new Map<string, CredentialBinding>();
    bindings.set("wf-1:n1:s", {
      key: { workflowId: "wf-1", nodeId: "n1", slotKey: "s" },
      instanceId: "inst-1",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as never);
    const instances = new Map<string, CredentialInstanceRecord>();
    instances.set("inst-1", makeInstance("inst-1", "unregistered.type"));
    const svc = makeService({ bindings, instances });
    await expect(svc.getSession({ workflowId: "wf-1", nodeId: "n1", slotKey: "s" })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("returns session on happy path", async () => {
    const bindings = new Map<string, CredentialBinding>();
    bindings.set("wf-1:n1:s", {
      key: { workflowId: "wf-1", nodeId: "n1", slotKey: "s" },
      instanceId: "inst-1",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as never);
    const instances = new Map<string, CredentialInstanceRecord>();
    instances.set("inst-1", makeInstance("inst-1", "test.type"));
    const svc = makeService({ bindings, instances, credentialTypeId: "test.type", sessionValue: { token: "abc" } });
    const session = await svc.getSession({ workflowId: "wf-1", nodeId: "n1", slotKey: "s" });
    expect(session).toEqual({ token: "abc" });
  });

  it("caches session by instanceId on repeated calls", async () => {
    let createSessionCalls = 0;
    const bindings = new Map<string, CredentialBinding>();
    bindings.set("wf-1:n1:s", {
      key: { workflowId: "wf-1", nodeId: "n1", slotKey: "s" },
      instanceId: "inst-cache",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as never);
    const instances = new Map<string, CredentialInstanceRecord>();
    instances.set("inst-cache", makeInstance("inst-cache", "cached.type"));
    const credentialStore = makeCredentialStore(bindings, instances);
    const runtimeMaterialService = makeRuntimeMaterialService();
    const fieldEnvOverlayService = new CredentialFieldEnvOverlayService(makeAppConfig());
    const typeRegistry = new CredentialTypeRegistryImpl();
    typeRegistry.register({
      definition: {
        typeId: "cached.type",
        displayName: "T",
        publicFields: [],
        secretFields: [],
        supportedSourceKinds: ["code"],
      } as never,
      createSession: async () => {
        createSessionCalls += 1;
        return { ok: true };
      },
    } as never);

    const svc = new CredentialSessionServiceImpl(
      credentialStore as never,
      runtimeMaterialService as never,
      fieldEnvOverlayService,
      typeRegistry,
      makeWorkflowRepository() as never,
      makeWorkflowCredentialNodeResolver() as never,
    );

    await svc.getSession({ workflowId: "wf-1", nodeId: "n1", slotKey: "s" });
    await svc.getSession({ workflowId: "wf-1", nodeId: "n1", slotKey: "s" });
    expect(createSessionCalls).toBe(1);
  });
});

describe("CredentialSessionServiceImpl.createSessionForInstance", () => {
  it("creates session directly from instanceId", async () => {
    const instances = new Map<string, CredentialInstanceRecord>();
    instances.set("inst-direct", makeInstance("inst-direct", "test.type"));
    const svc = makeService({ instances, credentialTypeId: "test.type", sessionValue: { direct: true } });
    const session = await svc.createSessionForInstance("inst-direct" as never);
    expect(session).toEqual({ direct: true });
  });

  it("throws 404 for unknown instanceId", async () => {
    const svc = makeService({});
    await expect(svc.createSessionForInstance("nonexistent" as never)).rejects.toMatchObject({ status: 404 });
  });
});

describe("CredentialSessionServiceImpl.evictInstance", () => {
  it("evicts cached session so next call re-creates it", async () => {
    let calls = 0;
    const bindings = new Map<string, CredentialBinding>();
    bindings.set("wf-1:n1:s", {
      key: { workflowId: "wf-1", nodeId: "n1", slotKey: "s" },
      instanceId: "inst-evict",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as never);
    const instances = new Map<string, CredentialInstanceRecord>();
    instances.set("inst-evict", makeInstance("inst-evict", "evict.type"));
    const credentialStore = makeCredentialStore(bindings, instances);
    const runtimeMaterialService = makeRuntimeMaterialService();
    const fieldEnvOverlayService = new CredentialFieldEnvOverlayService(makeAppConfig());
    const typeRegistry = new CredentialTypeRegistryImpl();
    typeRegistry.register({
      definition: {
        typeId: "evict.type",
        displayName: "T",
        publicFields: [],
        secretFields: [],
        supportedSourceKinds: ["code"],
      } as never,
      createSession: async () => {
        calls += 1;
        return { n: calls };
      },
    } as never);

    const svc = new CredentialSessionServiceImpl(
      credentialStore as never,
      runtimeMaterialService as never,
      fieldEnvOverlayService,
      typeRegistry,
      makeWorkflowRepository() as never,
      makeWorkflowCredentialNodeResolver() as never,
    );

    await svc.getSession({ workflowId: "wf-1", nodeId: "n1", slotKey: "s" });
    svc.evictInstance("inst-evict" as never);
    await svc.getSession({ workflowId: "wf-1", nodeId: "n1", slotKey: "s" });
    expect(calls).toBe(2);
  });
});

describe("CredentialSessionServiceImpl.evictBinding", () => {
  it("evicts binding and session caches", async () => {
    let calls = 0;
    const bindings = new Map<string, CredentialBinding>();
    const bindingKey = { workflowId: "wf-1", nodeId: "n1", slotKey: "s" };
    bindings.set("wf-1:n1:s", {
      key: bindingKey,
      instanceId: "inst-eb",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as never);
    const instances = new Map<string, CredentialInstanceRecord>();
    instances.set("inst-eb", makeInstance("inst-eb", "eb.type"));
    const credentialStore = makeCredentialStore(bindings, instances);
    const runtimeMaterialService = makeRuntimeMaterialService();
    const fieldEnvOverlayService = new CredentialFieldEnvOverlayService(makeAppConfig());
    const typeRegistry = new CredentialTypeRegistryImpl();
    typeRegistry.register({
      definition: {
        typeId: "eb.type",
        displayName: "T",
        publicFields: [],
        secretFields: [],
        supportedSourceKinds: ["code"],
      } as never,
      createSession: async () => {
        calls += 1;
        return { n: calls };
      },
    } as never);

    const svc = new CredentialSessionServiceImpl(
      credentialStore as never,
      runtimeMaterialService as never,
      fieldEnvOverlayService,
      typeRegistry,
      makeWorkflowRepository() as never,
      makeWorkflowCredentialNodeResolver() as never,
    );

    await svc.getSession(bindingKey);
    svc.evictBinding(bindingKey);
    await svc.getSession(bindingKey);
    expect(calls).toBe(2);
  });

  it("evictBinding is safe when binding key was never resolved", () => {
    const svc = makeService({});
    // Should not throw
    expect(() => svc.evictBinding({ workflowId: "wf-1", nodeId: "n", slotKey: "s" })).not.toThrow();
  });
});
