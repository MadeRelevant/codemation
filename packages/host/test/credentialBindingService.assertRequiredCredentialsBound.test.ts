import assert from "node:assert/strict";
import { test } from "vitest";

import type { CredentialBinding, CredentialBindingKey, WorkflowDefinition } from "@codemation/core";
import { CredentialUnboundError } from "@codemation/core";
import { CredentialBindingService } from "../src/domain/credentials/CredentialBindingService";
import type { CredentialStore, MutableCredentialSessionService } from "../src/domain/credentials/CredentialServices";
import type { WorkflowCredentialSlotRef } from "../src/domain/credentials/WorkflowCredentialNodeResolver";
import { WorkflowCredentialNodeResolver } from "../src/domain/credentials/WorkflowCredentialNodeResolver";

// ── Stubs ──────────────────────────────────────────────────────────────────

const WORKFLOW_ID = "wf.test";

const EMPTY_WORKFLOW: WorkflowDefinition = {
  id: WORKFLOW_ID,
  name: "Test Workflow",
  nodes: [],
  edges: [],
};

function makeSlotRef(overrides: Partial<WorkflowCredentialSlotRef> = {}): WorkflowCredentialSlotRef {
  return {
    workflowId: WORKFLOW_ID,
    nodeId: "node_1",
    nodeName: "My Node",
    requirement: {
      slotKey: "auth",
      label: "API key",
      acceptedTypes: ["test.cred"],
    },
    ...overrides,
  };
}

function makeBinding(nodeId = "node_1", slotKey = "auth"): CredentialBinding {
  return {
    key: { workflowId: WORKFLOW_ID, nodeId, slotKey },
    instanceId: "inst_1",
    updatedAt: new Date().toISOString(),
  };
}

class StubCredentialStore implements Partial<CredentialStore> {
  constructor(private readonly bindings: CredentialBinding[] = []) {}
  async listBindingsByWorkflowId(): Promise<ReadonlyArray<CredentialBinding>> {
    return this.bindings;
  }
  async getBinding(_key: CredentialBindingKey): Promise<CredentialBinding | undefined> {
    return this.bindings.find((b) => b.key.nodeId === _key.nodeId && b.key.slotKey === _key.slotKey);
  }
}

class StubSessionService implements Partial<MutableCredentialSessionService> {
  constructor(private readonly shouldThrow: boolean = false) {}
  async getSession<T>(): Promise<T> {
    if (this.shouldThrow) {
      throw new CredentialUnboundError({ workflowId: WORKFLOW_ID, nodeId: "node_1", slotKey: "auth" }, ["test.cred"]);
    }
    return {} as T;
  }
  evictInstance(): void {}
  evictBinding(): void {}
}

class StubNodeResolver extends WorkflowCredentialNodeResolver {
  constructor(private readonly slots: WorkflowCredentialSlotRef[]) {
    super();
  }
  override listSlots(): ReadonlyArray<WorkflowCredentialSlotRef> {
    return this.slots;
  }
}

function makeService(
  slots: WorkflowCredentialSlotRef[],
  bindings: CredentialBinding[],
  sessionThrows: boolean,
): CredentialBindingService {
  return new CredentialBindingService(
    new StubCredentialStore(bindings) as unknown as CredentialStore,
    null as never,
    { get: () => EMPTY_WORKFLOW } as never,
    new StubSessionService(sessionThrows) as unknown as MutableCredentialSessionService,
    new StubNodeResolver(slots) as WorkflowCredentialNodeResolver,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

test("assertRequiredCredentialsBound: workflow with no credential slots passes immediately", async () => {
  const service = makeService([], [], false);
  await assert.doesNotReject(() => service.assertRequiredCredentialsBound(WORKFLOW_ID));
});

test("assertRequiredCredentialsBound: all required slots have DB bindings — passes", async () => {
  const service = makeService([makeSlotRef()], [makeBinding()], false);
  await assert.doesNotReject(() => service.assertRequiredCredentialsBound(WORKFLOW_ID));
});

test("assertRequiredCredentialsBound: optional slot without binding is ignored", async () => {
  const slot = makeSlotRef({
    requirement: { slotKey: "auth", label: "API key", acceptedTypes: ["test.cred"], optional: true },
  });
  const service = makeService([slot], [], true); // session would throw but optional slots are skipped
  await assert.doesNotReject(() => service.assertRequiredCredentialsBound(WORKFLOW_ID));
});

test("assertRequiredCredentialsBound: slot missing from DB but session resolves — passes (custom session service fallback)", async () => {
  const service = makeService([makeSlotRef()], [], false); // no binding in DB, but session accepts
  await assert.doesNotReject(() => service.assertRequiredCredentialsBound(WORKFLOW_ID));
});

test("assertRequiredCredentialsBound: slot missing from DB and session throws — rejects with 400", async () => {
  const service = makeService([makeSlotRef()], [], true); // no binding, session throws
  await assert.rejects(
    () => service.assertRequiredCredentialsBound(WORKFLOW_ID),
    (err: Error) => {
      assert.ok(err.message.includes("Cannot run workflow"));
      assert.ok(err.message.includes("API key"));
      assert.ok(err.message.includes("My Node"));
      return true;
    },
  );
});

test("assertRequiredCredentialsBound: multiple unbound slots listed in error message", async () => {
  const slot1 = makeSlotRef({
    nodeId: "node_1",
    nodeName: "Node One",
    requirement: { slotKey: "auth", label: "Auth key", acceptedTypes: ["cred.a"] },
  });
  const slot2 = makeSlotRef({
    nodeId: "node_2",
    nodeName: "Node Two",
    requirement: { slotKey: "secret", label: "Secret", acceptedTypes: ["cred.b"] },
  });

  class ThrowingSessionService implements Partial<MutableCredentialSessionService> {
    async getSession<T>(): Promise<T> {
      throw new CredentialUnboundError({ workflowId: WORKFLOW_ID, nodeId: "node_1", slotKey: "auth" }, []);
    }
    evictInstance(): void {}
    evictBinding(): void {}
  }

  const service = new CredentialBindingService(
    new StubCredentialStore([]) as unknown as CredentialStore,
    null as never,
    { get: () => EMPTY_WORKFLOW } as never,
    new ThrowingSessionService() as unknown as MutableCredentialSessionService,
    new StubNodeResolver([slot1, slot2]) as WorkflowCredentialNodeResolver,
  );

  await assert.rejects(
    () => service.assertRequiredCredentialsBound(WORKFLOW_ID),
    (err: Error) => {
      assert.ok(err.message.includes("slots"));
      assert.ok(err.message.includes("Auth key"));
      assert.ok(err.message.includes("Secret"));
      return true;
    },
  );
});

test("assertRequiredCredentialsBound: mix of bound and unbound slots — only unbound ones reported", async () => {
  const slot1 = makeSlotRef({
    nodeId: "node_1",
    requirement: { slotKey: "auth", label: "Auth key", acceptedTypes: ["cred.a"] },
  });
  const slot2 = makeSlotRef({
    nodeId: "node_2",
    nodeName: "Broken Node",
    requirement: { slotKey: "secret", label: "Secret key", acceptedTypes: ["cred.b"] },
  });
  const bindings = [makeBinding("node_1", "auth")]; // node_1 bound, node_2 not

  class PartialSessionService implements Partial<MutableCredentialSessionService> {
    async getSession<T>(args: { nodeId: string }): Promise<T> {
      if (args.nodeId === "node_2") {
        throw new CredentialUnboundError({ workflowId: WORKFLOW_ID, nodeId: "node_2", slotKey: "secret" }, []);
      }
      return {} as T;
    }
    evictInstance(): void {}
    evictBinding(): void {}
  }

  const service = new CredentialBindingService(
    new StubCredentialStore(bindings) as unknown as CredentialStore,
    null as never,
    { get: () => EMPTY_WORKFLOW } as never,
    new PartialSessionService() as unknown as MutableCredentialSessionService,
    new StubNodeResolver([slot1, slot2]) as WorkflowCredentialNodeResolver,
  );

  await assert.rejects(
    () => service.assertRequiredCredentialsBound(WORKFLOW_ID),
    (err: Error) => {
      assert.ok(!err.message.includes("Auth key"), "bound slot should not be in error");
      assert.ok(err.message.includes("Secret key"));
      return true;
    },
  );
});
