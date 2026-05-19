import { describe, expect, it } from "vitest";
import { ManagedAuthMiddleware } from "../../src/auth/managed/ManagedAuthMiddleware";

type JwtVerifyResult = { userId: string; workspaceId: string } | { failure: string; message: string };

function makeVerifier(result: JwtVerifyResult): object {
  return { verify: async (_token: string): Promise<JwtVerifyResult> => result };
}

function makeMiddleware(result: JwtVerifyResult): ManagedAuthMiddleware {
  return new ManagedAuthMiddleware(makeVerifier(result) as never);
}

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader) {
    headers.set("authorization", authHeader);
  }
  return new Request("http://localhost/api/me", { headers });
}

describe("ManagedAuthMiddleware.verify", () => {
  it("returns null when Authorization header is missing", async () => {
    const middleware = makeMiddleware({ userId: "u1", workspaceId: "ws1" });
    const result = await middleware.verify(makeRequest());
    expect(result).toBeNull();
  });

  it("returns null when Authorization header is not a Bearer token", async () => {
    const middleware = makeMiddleware({ userId: "u1", workspaceId: "ws1" });
    const result = await middleware.verify(makeRequest("Basic dXNlcjpwYXNz"));
    expect(result).toBeNull();
  });

  it("returns null when Bearer token is empty", async () => {
    const middleware = makeMiddleware({ userId: "u1", workspaceId: "ws1" });
    const result = await middleware.verify(makeRequest("Bearer   "));
    expect(result).toBeNull();
  });

  it("returns null when JWT verification fails", async () => {
    const middleware = makeMiddleware({ failure: "token-expired", message: "Token expired" });
    const result = await middleware.verify(makeRequest("Bearer valid.token.here"));
    expect(result).toBeNull();
  });

  it("returns an AuthenticatedPrincipal when JWT verification succeeds", async () => {
    const middleware = makeMiddleware({ userId: "user_abc", workspaceId: "ws_xyz" });
    const result = await middleware.verify(makeRequest("Bearer valid.jwt.token"));
    expect(result).not.toBeNull();
    expect(result!.id).toBe("user_abc");
    expect(result!.workspaceId).toBe("ws_xyz");
    expect(result!.source).toBe("managed-jwt");
    expect(result!.email).toBeNull();
    expect(result!.name).toBeNull();
  });

  it("handles Bearer token with leading whitespace in authorization header", async () => {
    const middleware = makeMiddleware({ userId: "u1", workspaceId: "ws1" });
    const result = await middleware.verify(makeRequest("  Bearer mytoken"));
    expect(result).not.toBeNull();
    expect(result!.id).toBe("u1");
  });

  it("is case-insensitive for bearer scheme", async () => {
    const middleware = makeMiddleware({ userId: "u2", workspaceId: "ws2" });
    const result = await middleware.verify(makeRequest("BEARER mytoken"));
    expect(result).not.toBeNull();
  });
});
