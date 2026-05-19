/**
 * Additional unit tests for CredentialHttpRouteHandler.
 * Covers all methods beyond the withSecrets ownership check.
 */
import { describe, expect, it } from "vitest";
import type { QueryBus } from "../../src/application/bus/QueryBus";
import type { CommandBus } from "../../src/application/bus/CommandBus";
import { CredentialHttpRouteHandler } from "../../src/presentation/http/routeHandlers/CredentialHttpRouteHandler";

// ── Stubs ──────────────────────────────────────────────────────────────────────

class StubQueryBus implements QueryBus {
  execute<TResult>(): Promise<TResult> {
    return Promise.resolve({
      instanceId: "cred-1",
      typeId: "test.apiKey",
      displayName: "Test",
      sourceKind: "db",
      publicConfig: {},
      tags: [],
      setupStatus: "complete",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as TResult);
  }
}

class StubCommandBus implements CommandBus {
  execute<TResult>(): Promise<TResult> {
    return Promise.resolve({
      instanceId: "cred-1",
      typeId: "test.apiKey",
      displayName: "Test",
      sourceKind: "db",
      publicConfig: {},
      tags: [],
      setupStatus: "complete",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as TResult);
  }
}

function makeHandler() {
  return new CredentialHttpRouteHandler(new StubQueryBus(), new StubCommandBus(), { verify: async () => null }, null);
}

function makeJsonRequest(body: unknown, method = "POST") {
  return new Request("http://localhost/api/credentials", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("CredentialHttpRouteHandler — all methods", () => {
  it("getCredentialTypes returns 200", async () => {
    const res = await makeHandler().getCredentialTypes();
    expect(res.status).toBe(200);
  });

  it("getCredentialTypes returns 500 on error", async () => {
    const badQueryBus = {
      execute: async () => {
        throw new Error("db error");
      },
    } as never;
    const handler = new CredentialHttpRouteHandler(
      badQueryBus,
      new StubCommandBus(),
      { verify: async () => null },
      null,
    );
    const res = await handler.getCredentialTypes();
    expect(res.status).toBe(500);
  });

  it("getCredentialFieldEnvStatus returns 200", async () => {
    const res = await makeHandler().getCredentialFieldEnvStatus();
    expect(res.status).toBe(200);
  });

  it("getCredentialFieldEnvStatus returns 500 on error", async () => {
    const badQueryBus = {
      execute: async () => {
        throw new Error("env error");
      },
    } as never;
    const handler = new CredentialHttpRouteHandler(
      badQueryBus,
      new StubCommandBus(),
      { verify: async () => null },
      null,
    );
    const res = await handler.getCredentialFieldEnvStatus();
    expect(res.status).toBe(500);
  });

  it("getCredentialInstances returns 200", async () => {
    const res = await makeHandler().getCredentialInstances();
    expect(res.status).toBe(200);
  });

  it("getCredentialInstances returns 500 on error", async () => {
    const badQueryBus = {
      execute: async () => {
        throw new Error("list error");
      },
    } as never;
    const handler = new CredentialHttpRouteHandler(
      badQueryBus,
      new StubCommandBus(),
      { verify: async () => null },
      null,
    );
    const res = await handler.getCredentialInstances();
    expect(res.status).toBe(500);
  });

  it("getCredentialInstance returns 200 when found", async () => {
    const req = new Request("http://localhost/api/credentials/cred-1");
    const res = await makeHandler().getCredentialInstance(req, { instanceId: "cred-1" });
    expect(res.status).toBe(200);
  });

  it("getCredentialInstance returns 404 when not found", async () => {
    const notFoundQueryBus = { execute: async () => null } as never;
    const handler = new CredentialHttpRouteHandler(
      notFoundQueryBus,
      new StubCommandBus(),
      { verify: async () => null },
      null,
    );
    const req = new Request("http://localhost/api/credentials/missing");
    const res = await handler.getCredentialInstance(req, { instanceId: "missing" });
    expect(res.status).toBe(404);
  });

  it("getCredentialInstance with withSecrets=1 and valid local principal returns 200", async () => {
    const principal = {
      id: "user-1",
      email: "u@example.com",
      name: "User",
      source: "local" as const,
    };
    const handler = new CredentialHttpRouteHandler(
      new StubQueryBus(),
      new StubCommandBus(),
      { verify: async () => principal as never },
      null,
    );
    const req = new Request("http://localhost/api/credentials/cred-1?withSecrets=1");
    const res = await handler.getCredentialInstance(req, { instanceId: "cred-1" });
    expect(res.status).toBe(200);
  });

  it("postCredentialInstance returns 200", async () => {
    const req = makeJsonRequest({ typeId: "test.cred", displayName: "New", sourceKind: "db" });
    const res = await makeHandler().postCredentialInstance(req);
    expect(res.status).toBe(200);
  });

  it("postCredentialInstance returns 500 on error", async () => {
    const badCommandBus = {
      execute: async () => {
        throw new Error("create error");
      },
    } as never;
    const handler = new CredentialHttpRouteHandler(
      new StubQueryBus(),
      badCommandBus,
      { verify: async () => null },
      null,
    );
    const req = makeJsonRequest({ typeId: "test.cred", displayName: "New", sourceKind: "db" });
    const res = await handler.postCredentialInstance(req);
    expect(res.status).toBe(500);
  });

  it("putCredentialInstance returns 200", async () => {
    const req = makeJsonRequest({ displayName: "Updated" }, "PUT");
    const res = await makeHandler().putCredentialInstance(req, { instanceId: "cred-1" });
    expect(res.status).toBe(200);
  });

  it("putCredentialInstance returns 500 on error", async () => {
    const badCommandBus = {
      execute: async () => {
        throw new Error("update error");
      },
    } as never;
    const handler = new CredentialHttpRouteHandler(
      new StubQueryBus(),
      badCommandBus,
      { verify: async () => null },
      null,
    );
    const req = makeJsonRequest({ displayName: "Updated" }, "PUT");
    const res = await handler.putCredentialInstance(req, { instanceId: "cred-1" });
    expect(res.status).toBe(500);
  });

  it("deleteCredentialInstance returns 200", async () => {
    const req = new Request("http://localhost/api/credentials/cred-1", { method: "DELETE" });
    const res = await makeHandler().deleteCredentialInstance(req, { instanceId: "cred-1" });
    expect(res.status).toBe(200);
  });

  it("deleteCredentialInstance returns 500 on error", async () => {
    const badCommandBus = {
      execute: async () => {
        throw new Error("delete error");
      },
    } as never;
    const handler = new CredentialHttpRouteHandler(
      new StubQueryBus(),
      badCommandBus,
      { verify: async () => null },
      null,
    );
    const req = new Request("http://localhost/api/credentials/cred-1", { method: "DELETE" });
    const res = await handler.deleteCredentialInstance(req, { instanceId: "cred-1" });
    expect(res.status).toBe(500);
  });

  it("putCredentialBinding returns 200", async () => {
    const req = makeJsonRequest({ workflowId: "wf-1", nodeId: "n-1", slotKey: "auth", instanceId: "cred-1" }, "PUT");
    const res = await makeHandler().putCredentialBinding(req);
    expect(res.status).toBe(200);
  });

  it("putCredentialBinding returns 500 on error", async () => {
    const badCommandBus = {
      execute: async () => {
        throw new Error("binding error");
      },
    } as never;
    const handler = new CredentialHttpRouteHandler(
      new StubQueryBus(),
      badCommandBus,
      { verify: async () => null },
      null,
    );
    const req = makeJsonRequest({ workflowId: "wf-1", nodeId: "n-1", slotKey: "auth", instanceId: "cred-1" }, "PUT");
    const res = await handler.putCredentialBinding(req);
    expect(res.status).toBe(500);
  });

  it("postCredentialInstanceTest returns 200", async () => {
    const req = new Request("http://localhost/api/credentials/cred-1/test", { method: "POST" });
    const res = await makeHandler().postCredentialInstanceTest(req, { instanceId: "cred-1" });
    expect(res.status).toBe(200);
  });

  it("postCredentialInstanceTest returns 500 on error", async () => {
    const badCommandBus = {
      execute: async () => {
        throw new Error("test error");
      },
    } as never;
    const handler = new CredentialHttpRouteHandler(
      new StubQueryBus(),
      badCommandBus,
      { verify: async () => null },
      null,
    );
    const req = new Request("http://localhost/api/credentials/cred-1/test", { method: "POST" });
    const res = await handler.postCredentialInstanceTest(req, { instanceId: "cred-1" });
    expect(res.status).toBe(500);
  });

  it("getWorkflowCredentialHealth returns 200", async () => {
    const req = new Request("http://localhost/api/workflows/wf-1/credential-health");
    const res = await makeHandler().getWorkflowCredentialHealth(req, { workflowId: "wf-1" });
    expect(res.status).toBe(200);
  });

  it("getWorkflowCredentialHealth returns 500 on error", async () => {
    const badQueryBus = {
      execute: async () => {
        throw new Error("health error");
      },
    } as never;
    const handler = new CredentialHttpRouteHandler(
      badQueryBus,
      new StubCommandBus(),
      { verify: async () => null },
      null,
    );
    const req = new Request("http://localhost/api/workflows/wf-1/credential-health");
    const res = await handler.getWorkflowCredentialHealth(req, { workflowId: "wf-1" });
    expect(res.status).toBe(500);
  });
});
