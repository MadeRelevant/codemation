import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { ManagedMeHonoApiRouteRegistrar } from "../src/presentation/http/hono/registrars/ManagedMeHonoApiRouteRegistrar";
import type { SessionVerifier } from "../src/application/auth/SessionVerifier";
import type { AuthenticatedPrincipal } from "../src/application/auth/AuthenticatedPrincipal";

function makeApp(verifier: SessionVerifier): Hono {
  const app = new Hono().basePath("/api");
  const registrar = new ManagedMeHonoApiRouteRegistrar(verifier);
  registrar.register(app);
  return app;
}

describe("ManagedMeHonoApiRouteRegistrar", () => {
  it("returns 401 when no Authorization header is present", async () => {
    const verifier: SessionVerifier = { verify: async () => null };
    const app = makeApp(verifier);
    const res = await app.request("/api/me");
    expect(res.status).toBe(401);
  });

  it("returns { userId, workspaceId } for a valid managed JWT principal", async () => {
    const principal: AuthenticatedPrincipal = {
      id: "user_123",
      email: null,
      name: null,
      source: "managed-jwt",
      workspaceId: "ws_456",
    };
    const verifier: SessionVerifier = { verify: async () => principal };
    const app = makeApp(verifier);
    const res = await app.request("/api/me", {
      headers: { Authorization: "Bearer stubtoken" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ userId: "user_123", workspaceId: "ws_456" });
  });

  it("returns workspaceId as null when the principal has no workspaceId", async () => {
    const principal: AuthenticatedPrincipal = {
      id: "user_789",
      email: "test@example.com",
      name: "Test",
    };
    const verifier: SessionVerifier = { verify: async () => principal };
    const app = makeApp(verifier);
    const res = await app.request("/api/me", {
      headers: { Authorization: "Bearer stubtoken" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ userId: "user_789", workspaceId: null });
  });
});
