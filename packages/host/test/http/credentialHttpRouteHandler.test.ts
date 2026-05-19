// @vitest-environment node

/**
 * Unit tests for CredentialHttpRouteHandler ownership check (Sprint 14 Story 03).
 *
 * Verifies that ?withSecrets=1 returns 403 when the requesting principal's
 * workspaceId (from a managed-JWT aud claim) does not match the installation's
 * own workspaceId (from PairingConfig). Local-auth mode (no pairingConfig) is
 * unaffected.
 */
import { describe, it, expect } from "vitest";
import type { QueryBus } from "../../src/application/bus/QueryBus";
import type { Query } from "../../src/application/bus/Query";
import type { CommandBus } from "../../src/application/bus/CommandBus";
import type { Command } from "../../src/application/bus/Command";
import type { SessionVerifier } from "../../src/application/auth/SessionVerifier";
import type { AuthenticatedPrincipal } from "../../src/application/auth/AuthenticatedPrincipal";
import type { PairingConfig } from "../../src/pairing/pairing.types";
import { CredentialHttpRouteHandler } from "../../src/presentation/http/routeHandlers/CredentialHttpRouteHandler";

// ── Stubs ──────────────────────────────────────────────────────────────────────

class StubQueryBus implements QueryBus {
  execute<TResult>(_query: Query<TResult>): Promise<TResult> {
    // Return a minimal CredentialInstanceDto-shaped object for all queries.
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
  execute<TResult>(_command: Command<TResult>): Promise<TResult> {
    return Promise.resolve(undefined as unknown as TResult);
  }
}

function makeHandler(
  principal: AuthenticatedPrincipal | null,
  pairingConfig: PairingConfig | null,
): CredentialHttpRouteHandler {
  const sessionVerifier: SessionVerifier = {
    verify: () => Promise.resolve(principal),
  };
  return new CredentialHttpRouteHandler(new StubQueryBus(), new StubCommandBus(), sessionVerifier, pairingConfig);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("CredentialHttpRouteHandler — ?withSecrets=1 ownership check (Story 03 D3)", () => {
  const INSTALLATION_WORKSPACE_ID = "ws-installation";

  const pairingConfig: PairingConfig = {
    workspaceId: INSTALLATION_WORKSPACE_ID,
    pairingSecret: "c2VjcmV0",
    controlPlaneUrl: "https://cp.example.com",
  };

  it("returns 403 when managed-jwt principal has a different workspaceId than the installation", async () => {
    const principal: AuthenticatedPrincipal = {
      id: "user-1",
      email: "user@example.com",
      name: "User",
      source: "managed-jwt",
      workspaceId: "ws-other-workspace",
    };

    const handler = makeHandler(principal, pairingConfig);
    const req = new Request("http://localhost/api/credentials/cred-1?withSecrets=1");
    const res = await handler.getCredentialInstance(req, { instanceId: "cred-1" });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Forbidden");
  });

  it("allows access when managed-jwt principal has the correct workspaceId", async () => {
    const principal: AuthenticatedPrincipal = {
      id: "user-1",
      email: "user@example.com",
      name: "User",
      source: "managed-jwt",
      workspaceId: INSTALLATION_WORKSPACE_ID,
    };

    const handler = makeHandler(principal, pairingConfig);
    const req = new Request("http://localhost/api/credentials/cred-1?withSecrets=1");
    const res = await handler.getCredentialInstance(req, { instanceId: "cred-1" });

    expect(res.status).toBe(200);
  });

  it("allows access in local-auth mode (no pairingConfig) regardless of principal", async () => {
    const principal: AuthenticatedPrincipal = {
      id: "user-1",
      email: "user@example.com",
      name: "User",
      // No source / workspaceId — local auth principal shape
    };

    const handler = makeHandler(principal, null);
    const req = new Request("http://localhost/api/credentials/cred-1?withSecrets=1");
    const res = await handler.getCredentialInstance(req, { instanceId: "cred-1" });

    expect(res.status).toBe(200);
  });

  it("returns 403 when principal is null (unauthenticated) with ?withSecrets=1", async () => {
    const handler = makeHandler(null, null);
    const req = new Request("http://localhost/api/credentials/cred-1?withSecrets=1");
    const res = await handler.getCredentialInstance(req, { instanceId: "cred-1" });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Forbidden");
  });

  it("returns 403 when principal is null in managed-auth mode with ?withSecrets=1", async () => {
    const handler = makeHandler(null, pairingConfig);
    const req = new Request("http://localhost/api/credentials/cred-1?withSecrets=1");
    const res = await handler.getCredentialInstance(req, { instanceId: "cred-1" });

    expect(res.status).toBe(403);
  });

  it("does not check ownership when withSecrets is not requested", async () => {
    // Even with a mismatched workspaceId, no-secrets requests pass through.
    const principal: AuthenticatedPrincipal = {
      id: "user-1",
      email: "user@example.com",
      name: "User",
      source: "managed-jwt",
      workspaceId: "ws-different",
    };

    const handler = makeHandler(principal, pairingConfig);
    const req = new Request("http://localhost/api/credentials/cred-1");
    const res = await handler.getCredentialInstance(req, { instanceId: "cred-1" });

    // No ownership check — passes through to query bus.
    expect(res.status).toBe(200);
  });
});

// ── Additional coverage for non-ownership methods ─────────────────────────────

describe("CredentialHttpRouteHandler — additional methods", () => {
  function makeSimpleHandler(): CredentialHttpRouteHandler {
    return makeHandler(null, null);
  }

  it("getCredentialTypes returns 200 with types list", async () => {
    const handler = makeSimpleHandler();
    const res = await handler.getCredentialTypes();
    expect(res.status).toBe(200);
  });

  it("getCredentialTypes returns 500 on error", async () => {
    const badQueryBus: QueryBus = {
      execute: async () => {
        throw new Error("db error");
      },
    };
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
    const handler = makeSimpleHandler();
    const res = await handler.getCredentialFieldEnvStatus();
    expect(res.status).toBe(200);
  });

  it("getCredentialInstances returns 200", async () => {
    const handler = makeSimpleHandler();
    const res = await handler.getCredentialInstances();
    expect(res.status).toBe(200);
  });

  it("getCredentialInstance returns 404 when not found", async () => {
    const notFoundQueryBus: QueryBus = { execute: async () => null as never };
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

  it("postCredentialInstance returns 200", async () => {
    const handler = makeSimpleHandler();
    const req = new Request("http://localhost/api/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ typeId: "test.cred", displayName: "New", sourceKind: "db" }),
    });
    const res = await handler.postCredentialInstance(req);
    expect(res.status).toBe(200);
  });

  it("putCredentialInstance returns 200", async () => {
    const handler = makeSimpleHandler();
    const req = new Request("http://localhost/api/credentials/cred-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Updated" }),
    });
    const res = await handler.putCredentialInstance(req, { instanceId: "cred-1" });
    expect(res.status).toBe(200);
  });

  it("deleteCredentialInstance returns 200", async () => {
    const handler = makeSimpleHandler();
    const req = new Request("http://localhost/api/credentials/cred-1", { method: "DELETE" });
    const res = await handler.deleteCredentialInstance(req, { instanceId: "cred-1" });
    expect(res.status).toBe(200);
  });

  it("putCredentialBinding returns 200", async () => {
    const handler = makeSimpleHandler();
    const req = new Request("http://localhost/api/credentials/bindings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflowId: "wf-1", nodeId: "n-1", slotKey: "auth", instanceId: "cred-1" }),
    });
    const res = await handler.putCredentialBinding(req);
    expect(res.status).toBe(200);
  });

  it("postCredentialInstanceTest returns 200", async () => {
    const handler = makeSimpleHandler();
    const req = new Request("http://localhost/api/credentials/cred-1/test", { method: "POST" });
    const res = await handler.postCredentialInstanceTest(req, { instanceId: "cred-1" });
    expect(res.status).toBe(200);
  });

  it("getWorkflowCredentialHealth returns 200", async () => {
    const handler = makeSimpleHandler();
    const req = new Request("http://localhost/api/workflows/wf-1/credential-health");
    const res = await handler.getWorkflowCredentialHealth(req, { workflowId: "wf-1" });
    expect(res.status).toBe(200);
  });

  it("getCredentialInstance with withSecrets=1 and local-auth (no pairingConfig) returns 200 with valid principal", async () => {
    const principal = {
      id: "user-1",
      email: "u@example.com",
      name: "User",
    };
    const handler = makeHandler(principal, null);
    const req = new Request("http://localhost/api/credentials/cred-1?withSecrets=1");
    const res = await handler.getCredentialInstance(req, { instanceId: "cred-1" });
    expect(res.status).toBe(200);
  });
});
