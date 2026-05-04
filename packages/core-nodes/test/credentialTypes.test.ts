import {
  apiKeyCredentialType,
  basicAuthCredentialType,
  bearerTokenCredentialType,
  oauth2ClientCredentialsType,
} from "../src/credentials/index";
import assert from "node:assert/strict";
import { describe, test } from "vitest";

function makeArgs<TPublic extends Record<string, unknown>, TMaterial extends Record<string, unknown>>(
  publicConfig: TPublic,
  material: TMaterial,
) {
  return {
    instance: {
      instanceId: "inst_test",
      typeId: "test",
      displayName: "Test",
      sourceKind: "db" as const,
      publicConfig,
      secretRef: material,
      tags: [],
      setupStatus: "ready" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    publicConfig,
    material,
  };
}

describe("BearerTokenCredentialType", () => {
  test("createSession injects Authorization Bearer header", async () => {
    const session = await bearerTokenCredentialType.createSession(
      makeArgs({}, { token: "secret-123" }),
    );
    const delta = session.applyToRequest({} as any);
    assert.equal(delta.headers?.authorization, "Bearer secret-123");
    assert.equal(delta.query, undefined);
  });

  test("createSession throws when token is missing", async () => {
    await assert.rejects(
      () => bearerTokenCredentialType.createSession(makeArgs({}, { token: "" })),
      /token is required/,
    );
  });

  test("test returns healthy when token present", async () => {
    const health = await bearerTokenCredentialType.test(makeArgs({}, { token: "abc" }));
    assert.equal(health.status, "healthy");
  });

  test("test returns failing when token absent", async () => {
    const health = await bearerTokenCredentialType.test(makeArgs({}, { token: "" }));
    assert.equal(health.status, "failing");
  });
});

describe("ApiKeyCredentialType", () => {
  test("injects as header by default", async () => {
    const session = await apiKeyCredentialType.createSession(
      makeArgs({ placement: "header", name: "X-API-Key" }, { apiKey: "key-abc" }),
    );
    const delta = session.applyToRequest({} as any);
    assert.equal(delta.headers?.["X-API-Key"], "key-abc");
    assert.equal(delta.query, undefined);
  });

  test("injects as query param when placement=query", async () => {
    const session = await apiKeyCredentialType.createSession(
      makeArgs({ placement: "query", name: "token" }, { apiKey: "key-xyz" }),
    );
    const delta = session.applyToRequest({} as any);
    assert.equal(delta.query?.token, "key-xyz");
    assert.equal(delta.headers, undefined);
  });

  test("uses default header name X-API-Key when name not provided", async () => {
    const session = await apiKeyCredentialType.createSession(
      makeArgs({ placement: "header", name: "" }, { apiKey: "key" }),
    );
    const delta = session.applyToRequest({} as any);
    assert.equal(delta.headers?.["X-API-Key"], "key");
  });

  test("uses default query name api_key when name not provided and placement=query", async () => {
    const session = await apiKeyCredentialType.createSession(
      makeArgs({ placement: "query", name: "" }, { apiKey: "key" }),
    );
    const delta = session.applyToRequest({} as any);
    assert.equal(delta.query?.api_key, "key");
  });
});

describe("BasicAuthCredentialType", () => {
  test("injects base64 encoded Authorization Basic header", async () => {
    const session = await basicAuthCredentialType.createSession(
      makeArgs({ username: "alice" }, { password: "secret" }),
    );
    const delta = session.applyToRequest({} as any);
    const expected = `Basic ${Buffer.from("alice:secret").toString("base64")}`;
    assert.equal(delta.headers?.authorization, expected);
  });

  test("createSession throws when username is missing", async () => {
    await assert.rejects(
      () => basicAuthCredentialType.createSession(makeArgs({ username: "" }, { password: "x" })),
      /username is required/,
    );
  });

  test("test returns failing when password is missing", async () => {
    const health = await basicAuthCredentialType.test(makeArgs({ username: "alice" }, { password: "" }));
    assert.equal(health.status, "failing");
  });
});

describe("OAuth2ClientCredentialsType", () => {
  test("createSession exchanges credentials for token and injects Bearer header", async () => {
    // Stub globalThis.fetch for this test
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(JSON.stringify({ access_token: "oauth2-token-abc" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    try {
      const session = await oauth2ClientCredentialsType.createSession(
        makeArgs(
          { tokenUrl: "https://auth.example.com/token", scopes: "read write", audience: "" },
          { clientId: "my-client", clientSecret: "my-secret" },
        ),
      );
      const delta = session.applyToRequest({} as any);
      assert.equal(delta.headers?.authorization, "Bearer oauth2-token-abc");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("createSession throws when token exchange fails", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response("Unauthorized", { status: 401, statusText: "Unauthorized" });
    };
    try {
      await assert.rejects(
        () =>
          oauth2ClientCredentialsType.createSession(
            makeArgs(
              { tokenUrl: "https://auth.example.com/token", scopes: "", audience: "" },
              { clientId: "c", clientSecret: "s" },
            ),
          ),
        /Token exchange failed/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("test returns healthy on successful token exchange", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ access_token: "t" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    try {
      const health = await oauth2ClientCredentialsType.test(
        makeArgs(
          { tokenUrl: "https://auth.example.com/token", scopes: "", audience: "" },
          { clientId: "c", clientSecret: "s" },
        ),
      );
      assert.equal(health.status, "healthy");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("test returns failing when token exchange fails", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response("error", { status: 500, statusText: "Server Error" });
    };
    try {
      const health = await oauth2ClientCredentialsType.test(
        makeArgs(
          { tokenUrl: "https://auth.example.com/token", scopes: "", audience: "" },
          { clientId: "c", clientSecret: "s" },
        ),
      );
      assert.equal(health.status, "failing");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
