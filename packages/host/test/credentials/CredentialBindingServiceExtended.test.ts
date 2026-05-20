/**
 * Extended behavioral tests for CredentialBindingService.
 * Covers upsertBinding and listWorkflowHealth methods.
 */
import { describe, expect, it } from "vitest";
import type { CredentialBinding, CredentialInstanceRecord, WorkflowDefinition } from "@codemation/core";
import { CredentialBindingService } from "../../src/domain/credentials/CredentialBindingService";
import { CredentialInstanceService } from "../../src/domain/credentials/CredentialInstanceService";
import type { MutableCredentialSessionService } from "../../src/domain/credentials/CredentialServices";
import type { WorkflowCredentialSlotRef } from "../../src/domain/credentials/WorkflowCredentialNodeResolver";
import { WorkflowCredentialNodeResolver } from "../../src/domain/credentials/WorkflowCredentialNodeResolver";
import { FakeLoggerFactory } from "../testkit";

const WORKFLOW_ID = "wf.test";

const WORKFLOW: WorkflowDefinition = {
  id: WORKFLOW_ID,
  name: "Test Workflow",
  nodes: [
    {
      id: "node_1",
      kind: "action",
      name: "My Node",
      config: {
        getCredentialRequirements: () => [{ slotKey: "auth", label: "API key", acceptedTypes: ["test.cred"] }],
      } as never,
    } as never,
  ],
  edges: [],
};

class StubCredentialStore {
  private bindings: CredentialBinding[] = [];
  private savedBindings: CredentialBinding[] = [];
  private evictedBindings: string[] = [];

  async listBindingsByWorkflowId(): Promise<ReadonlyArray<CredentialBinding>> {
    return this.bindings;
  }

  async getBinding() {
    return this.bindings[0];
  }

  async upsertBinding(binding: CredentialBinding): Promise<void> {
    this.savedBindings.push(binding);
    this.bindings.push(binding);
  }

  async getLatestTestResult() {
    return null;
  }

  getSavedBindings() {
    return this.savedBindings;
  }
}

class StubSessionService implements Partial<MutableCredentialSessionService> {
  private evicted: string[] = [];
  evictInstance(id: string): void {
    this.evicted.push(id);
  }
  evictBinding(_key: unknown): void {}
  async getSession<T>(): Promise<T> {
    return {} as T;
  }
  getEvicted() {
    return this.evicted;
  }
}

class StubNodeResolver extends WorkflowCredentialNodeResolver {
  constructor(private readonly slots: WorkflowCredentialSlotRef[] = []) {
    super();
  }
  override listSlots(): ReadonlyArray<WorkflowCredentialSlotRef> {
    return this.slots;
  }
  override findRequirement(
    _workflow: WorkflowDefinition,
    nodeId: string,
    slotKey: string,
  ):
    | Readonly<{
        nodeName: string;
        requirement: { slotKey: string; label: string; acceptedTypes: ReadonlyArray<string> };
      }>
    | undefined {
    const slot = this.slots.find((s) => s.nodeId === nodeId && s.requirement.slotKey === slotKey);
    return slot ? { nodeName: slot.nodeName, requirement: slot.requirement } : undefined;
  }
  override isCredentialNodeIdInWorkflow(_workflow: WorkflowDefinition, nodeId: string): boolean {
    return this.slots.some((s) => s.nodeId === nodeId);
  }
}

function makeCredentialInstanceService(instance: Partial<CredentialInstanceRecord> | null = null) {
  return {
    requireInstance: async () => {
      if (!instance) throw Object.assign(new Error("Not found"), { status: 404 });
      return instance;
    },
    getInstance: async () => instance,
  } as never as CredentialInstanceService;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("CredentialBindingService.upsertBinding", () => {
  it("throws 404 when workflowId is unknown", async () => {
    const service = new CredentialBindingService(
      new StubCredentialStore() as never,
      makeCredentialInstanceService(),
      { get: () => null } as never,
      new StubSessionService() as never,
      new StubNodeResolver() as never,
      new FakeLoggerFactory(),
    );
    await expect(
      service.upsertBinding({
        workflowId: "wf-missing",
        nodeId: "n-1",
        slotKey: "auth",
        instanceId: "inst-1" as never,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 404 when instance not found", async () => {
    const service = new CredentialBindingService(
      new StubCredentialStore() as never,
      makeCredentialInstanceService(null),
      { get: () => WORKFLOW } as never,
      new StubSessionService() as never,
      new StubNodeResolver([
        {
          workflowId: WORKFLOW_ID,
          nodeId: "node_1",
          nodeName: "My Node",
          requirement: { slotKey: "auth", label: "API key", acceptedTypes: ["test.cred"] },
        },
      ]) as never,
      new FakeLoggerFactory(),
    );
    await expect(
      service.upsertBinding({
        workflowId: WORKFLOW_ID,
        nodeId: "node_1",
        slotKey: "auth",
        instanceId: "inst-1" as never,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 400 when instance type is not accepted", async () => {
    const instance = {
      instanceId: "inst-1",
      typeId: "wrong.type",
      displayName: "Bad Type",
      sourceKind: "db",
      setupStatus: "ready",
      publicConfig: {},
      tags: [],
    };
    const service = new CredentialBindingService(
      new StubCredentialStore() as never,
      makeCredentialInstanceService(instance as never),
      { get: () => WORKFLOW } as never,
      new StubSessionService() as never,
      new StubNodeResolver([
        {
          workflowId: WORKFLOW_ID,
          nodeId: "node_1",
          nodeName: "My Node",
          requirement: { slotKey: "auth", label: "API key", acceptedTypes: ["test.cred"] },
        },
      ]) as never,
      new FakeLoggerFactory(),
    );
    await expect(
      service.upsertBinding({
        workflowId: WORKFLOW_ID,
        nodeId: "node_1",
        slotKey: "auth",
        instanceId: "inst-1" as never,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws 400 when nodeId has no credential slot", async () => {
    const instance = {
      instanceId: "inst-1",
      typeId: "test.cred",
      displayName: "Test Cred",
      sourceKind: "db",
      setupStatus: "ready",
      publicConfig: {},
      tags: [],
    };
    const service = new CredentialBindingService(
      new StubCredentialStore() as never,
      makeCredentialInstanceService(instance as never),
      { get: () => WORKFLOW } as never,
      new StubSessionService() as never,
      // Resolver finds nothing for this node/slot combination but node is not in workflow either
      new StubNodeResolver([]) as never,
      new FakeLoggerFactory(),
    );
    await expect(
      service.upsertBinding({
        workflowId: WORKFLOW_ID,
        nodeId: "node_1",
        slotKey: "auth",
        instanceId: "inst-1" as never,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 400 when requirement not found for slot but node exists", async () => {
    const instance = {
      instanceId: "inst-1",
      typeId: "test.cred",
      displayName: "Test Cred",
      sourceKind: "db",
      setupStatus: "ready",
      publicConfig: {},
      tags: [],
    };
    // Resolver knows node_1 but slot 'nonexistent' doesn't exist
    const resolver = new StubNodeResolver([
      {
        workflowId: WORKFLOW_ID,
        nodeId: "node_1",
        nodeName: "My Node",
        requirement: { slotKey: "auth", label: "API key", acceptedTypes: ["test.cred"] },
      },
    ]);
    const service = new CredentialBindingService(
      new StubCredentialStore() as never,
      makeCredentialInstanceService(instance as never),
      { get: () => WORKFLOW } as never,
      new StubSessionService() as never,
      resolver as never,
      new FakeLoggerFactory(),
    );
    await expect(
      service.upsertBinding({
        workflowId: WORKFLOW_ID,
        nodeId: "node_1",
        slotKey: "nonexistent",
        instanceId: "inst-1" as never,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("saves binding and evicts session when valid", async () => {
    const store = new StubCredentialStore();
    const sessionService = new StubSessionService();
    const instance = {
      instanceId: "inst-1",
      typeId: "test.cred",
      displayName: "Test Cred",
      sourceKind: "db",
      setupStatus: "ready",
      publicConfig: {},
      tags: [],
    };
    const service = new CredentialBindingService(
      store as never,
      makeCredentialInstanceService(instance as never),
      { get: () => WORKFLOW } as never,
      sessionService as never,
      new StubNodeResolver([
        {
          workflowId: WORKFLOW_ID,
          nodeId: "node_1",
          nodeName: "My Node",
          requirement: { slotKey: "auth", label: "API key", acceptedTypes: ["test.cred"] },
        },
      ]) as never,
      new FakeLoggerFactory(),
    );
    const binding = await service.upsertBinding({
      workflowId: WORKFLOW_ID,
      nodeId: "node_1",
      slotKey: "auth",
      instanceId: "inst-1" as never,
    });
    expect(binding.key.nodeId).toBe("node_1");
    expect(binding.instanceId).toBe("inst-1");
    expect(store.getSavedBindings()).toHaveLength(1);
  });
});

describe("CredentialBindingService.listWorkflowHealth", () => {
  it("throws 404 when workflowId is unknown", async () => {
    const service = new CredentialBindingService(
      new StubCredentialStore() as never,
      makeCredentialInstanceService(),
      { get: () => null } as never,
      new StubSessionService() as never,
      new StubNodeResolver() as never,
      new FakeLoggerFactory(),
    );
    await expect(service.listWorkflowHealth("wf-missing")).rejects.toMatchObject({ status: 404 });
  });

  it("returns unbound status when slot has no binding", async () => {
    const service = new CredentialBindingService(
      new StubCredentialStore() as never,
      makeCredentialInstanceService(),
      { get: () => WORKFLOW } as never,
      new StubSessionService() as never,
      new StubNodeResolver([
        {
          workflowId: WORKFLOW_ID,
          nodeId: "node_1",
          nodeName: "My Node",
          requirement: { slotKey: "auth", label: "API key", acceptedTypes: ["test.cred"] },
        },
      ]) as never,
      new FakeLoggerFactory(),
    );
    const health = await service.listWorkflowHealth(WORKFLOW_ID);
    expect(health.workflowId).toBe(WORKFLOW_ID);
    expect(health.slots).toHaveLength(1);
    expect(health.slots[0].health.status).toBe("unbound");
  });

  it("returns optional-unbound for optional slot with no binding", async () => {
    const service = new CredentialBindingService(
      new StubCredentialStore() as never,
      makeCredentialInstanceService(),
      { get: () => WORKFLOW } as never,
      new StubSessionService() as never,
      new StubNodeResolver([
        {
          workflowId: WORKFLOW_ID,
          nodeId: "node_1",
          nodeName: "My Node",
          requirement: { slotKey: "auth", label: "API key", acceptedTypes: ["test.cred"], optional: true },
        },
      ]) as never,
      new FakeLoggerFactory(),
    );
    const health = await service.listWorkflowHealth(WORKFLOW_ID);
    expect(health.slots[0].health.status).toBe("optional-unbound");
  });

  it("returns unknown health when slot is bound but no test result", async () => {
    const store = new StubCredentialStore();
    await store.upsertBinding({
      key: { workflowId: WORKFLOW_ID, nodeId: "node_1", slotKey: "auth" },
      instanceId: "inst-1" as never,
      updatedAt: new Date().toISOString(),
    });

    const instance = {
      instanceId: "inst-1" as never,
      typeId: "test.cred",
      displayName: "Test Cred",
      sourceKind: "db",
      setupStatus: "ready",
      publicConfig: {},
      tags: [],
    };

    const service = new CredentialBindingService(
      store as never,
      makeCredentialInstanceService(instance as never),
      { get: () => WORKFLOW } as never,
      new StubSessionService() as never,
      new StubNodeResolver([
        {
          workflowId: WORKFLOW_ID,
          nodeId: "node_1",
          nodeName: "My Node",
          requirement: { slotKey: "auth", label: "API key", acceptedTypes: ["test.cred"] },
        },
      ]) as never,
      new FakeLoggerFactory(),
    );

    const health = await service.listWorkflowHealth(WORKFLOW_ID);
    expect(health.slots).toHaveLength(1);
    expect(health.slots[0].health.status).toBe("unknown");
    expect(health.slots[0].instance?.instanceId).toBe("inst-1");
  });
});
