import { describe, expect, it } from "vitest";
import { ManagedOAuthFlowExecutor } from "../../src/credentials/ManagedOAuthFlowExecutor";
import { ManagedOAuthRefreshInvalidGrantError } from "../../src/credentials/ManagedOAuthRefreshInvalidGrantError";
import type { OAuthMaterial } from "@codemation/core";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const FAKE_TYPE_ID = "oauth.google.gmail";
const FAKE_INSTANCE_ID = "inst-abc-123";
const CONTROL_PLANE_URL = "https://cp.example.com";

const fakePairingConfig = {
  workspaceId: "ws-1",
  pairingSecret: "secret",
  controlPlaneUrl: CONTROL_PLANE_URL,
};

const fakeLoggerFactory = {
  create: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
  createPerformanceDiagnostics: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
};

function makeFakePairedFetch(responses: Map<string, Response>) {
  return {
    post: async (url: string, _body: unknown): Promise<Response> => {
      const response = responses.get(url);
      if (!response) {
        throw new Error(`No mock response registered for: ${url}`);
      }
      return response;
    },
    get: async (_url: string): Promise<Response> => {
      throw new Error("Unexpected GET in test");
    },
    delete: async (_url: string): Promise<Response> => {
      throw new Error("Unexpected DELETE in test");
    },
  };
}

function makeOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function makeErrorResponse(status: number, body = ""): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => body,
  } as Response;
}

function makeExecutor(pairedFetch: ReturnType<typeof makeFakePairedFetch>): ManagedOAuthFlowExecutor {
  return new ManagedOAuthFlowExecutor(pairedFetch as never, fakePairingConfig, fakeLoggerFactory as never);
}

// ---------------------------------------------------------------------------
// start()
// ---------------------------------------------------------------------------

describe("ManagedOAuthFlowExecutor.start", () => {
  it("builds the correct POST body and returns consent URL from CP response", async () => {
    let capturedBody: unknown;
    const fakeFetch = {
      post: async (url: string, body: unknown): Promise<Response> => {
        capturedBody = body;
        return makeOkResponse({ consentUrl: "https://consent.example.com", stateToken: "state-tok" });
      },
      get: async () => {
        throw new Error("unexpected");
      },
      delete: async () => {
        throw new Error("unexpected");
      },
    };
    const executor = makeExecutor(fakeFetch);

    const result = await executor.start({
      typeId: FAKE_TYPE_ID,
      scopes: ["https://mail.google.com/"],
      redirectUri: "http://localhost:3000/api/oauth2/callback",
    });

    expect(result.consentUrl).toBe("https://consent.example.com");
    expect(result.stateToken).toBe("state-tok");
    expect(capturedBody).toMatchObject({
      typeId: FAKE_TYPE_ID,
      scopes: ["https://mail.google.com/"],
      redirectUri: "http://localhost:3000/api/oauth2/callback",
    });
  });

  it("does not require instanceId (managed mode)", async () => {
    const fakeFetch = {
      post: async () => makeOkResponse({ consentUrl: "https://consent.example.com", stateToken: "st" }),
      get: async () => {
        throw new Error("unexpected");
      },
      delete: async () => {
        throw new Error("unexpected");
      },
    };
    const executor = makeExecutor(fakeFetch);

    // Should not throw even without instanceId
    const result = await executor.start({
      typeId: FAKE_TYPE_ID,
      scopes: [],
      redirectUri: "http://localhost:3000/api/oauth2/callback",
    });
    expect(result.consentUrl).toBeTruthy();
  });

  it("posts to the correct control-plane URL", async () => {
    let capturedUrl = "";
    const fakeFetch = {
      post: async (url: string): Promise<Response> => {
        capturedUrl = url;
        return makeOkResponse({ consentUrl: "https://c.com", stateToken: "s" });
      },
      get: async () => {
        throw new Error("unexpected");
      },
      delete: async () => {
        throw new Error("unexpected");
      },
    };
    const executor = makeExecutor(fakeFetch);
    await executor.start({ typeId: FAKE_TYPE_ID, scopes: [], redirectUri: "http://localhost:3000/cb" });
    expect(capturedUrl).toBe(`${CONTROL_PLANE_URL}/internal/oauth/start`);
  });

  it("throws on non-2xx response", async () => {
    const responses = new Map([
      [`${CONTROL_PLANE_URL}/internal/oauth/start`, makeErrorResponse(500, "internal error")],
    ]);
    const executor = makeExecutor(makeFakePairedFetch(responses));
    await expect(
      executor.start({ typeId: FAKE_TYPE_ID, scopes: [], redirectUri: "http://localhost:3000/cb" }),
    ).rejects.toThrow(/ManagedOAuthFlowExecutor.start failed: 500/);
  });
});

// ---------------------------------------------------------------------------
// lookupInstanceId()
// ---------------------------------------------------------------------------

describe("ManagedOAuthFlowExecutor.lookupInstanceId", () => {
  it("always returns undefined (state owned by control plane)", () => {
    const fakeFetch = {
      post: async () => makeOkResponse({}),
      get: async () => {
        throw new Error("unexpected");
      },
      delete: async () => {
        throw new Error("unexpected");
      },
    };
    const executor = makeExecutor(fakeFetch);
    expect(executor.lookupInstanceId("any-token")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// completeCallback()
// ---------------------------------------------------------------------------

describe("ManagedOAuthFlowExecutor.completeCallback", () => {
  it("forwards code and stateToken and returns OAuthMaterial from CP", async () => {
    let capturedBody: unknown;
    const expectedMaterial: OAuthMaterial = {
      accessToken: "access-tok",
      refreshToken: "refresh-tok",
      expiresAt: "2026-01-15T13:00:00.000Z",
      grantedScopes: ["https://mail.google.com/"],
    };
    const fakeFetch = {
      post: async (url: string, body: unknown): Promise<Response> => {
        capturedBody = body;
        return makeOkResponse(expectedMaterial);
      },
      get: async () => {
        throw new Error("unexpected");
      },
      delete: async () => {
        throw new Error("unexpected");
      },
    };
    const executor = makeExecutor(fakeFetch);

    const result = await executor.completeCallback({ stateToken: "state-tok", code: "auth-code" });

    expect(result).toEqual(expectedMaterial);
    expect(capturedBody).toMatchObject({ stateToken: "state-tok", code: "auth-code" });
  });

  it("posts to the correct control-plane URL", async () => {
    let capturedUrl = "";
    const fakeFetch = {
      post: async (url: string): Promise<Response> => {
        capturedUrl = url;
        return makeOkResponse({ accessToken: "at", grantedScopes: [] });
      },
      get: async () => {
        throw new Error("unexpected");
      },
      delete: async () => {
        throw new Error("unexpected");
      },
    };
    const executor = makeExecutor(fakeFetch);
    await executor.completeCallback({ stateToken: "st", code: "c" });
    expect(capturedUrl).toBe(`${CONTROL_PLANE_URL}/internal/oauth/complete`);
  });

  it("throws on non-2xx response", async () => {
    const responses = new Map([
      [`${CONTROL_PLANE_URL}/internal/oauth/complete`, makeErrorResponse(400, "bad request")],
    ]);
    const executor = makeExecutor(makeFakePairedFetch(responses));
    await expect(executor.completeCallback({ stateToken: "st", code: "c" })).rejects.toThrow(
      /ManagedOAuthFlowExecutor.completeCallback failed: 400/,
    );
  });
});

// ---------------------------------------------------------------------------
// refresh()
// ---------------------------------------------------------------------------

describe("ManagedOAuthFlowExecutor.refresh", () => {
  const existingMaterial: OAuthMaterial = {
    accessToken: "old-access",
    refreshToken: "refresh-tok",
    grantedScopes: ["https://mail.google.com/"],
  };

  it("sends the correct body and returns new OAuthMaterial", async () => {
    let capturedBody: unknown;
    const newMaterial: OAuthMaterial = {
      accessToken: "new-access",
      refreshToken: "new-refresh",
      expiresAt: "2026-01-15T13:00:00.000Z",
      grantedScopes: ["https://mail.google.com/"],
    };
    const fakeFetch = {
      post: async (url: string, body: unknown): Promise<Response> => {
        capturedBody = body;
        return makeOkResponse(newMaterial);
      },
      get: async () => {
        throw new Error("unexpected");
      },
      delete: async () => {
        throw new Error("unexpected");
      },
    };
    const executor = makeExecutor(fakeFetch);

    const result = await executor.refresh({
      typeId: FAKE_TYPE_ID,
      instanceId: FAKE_INSTANCE_ID,
      material: existingMaterial,
    });

    expect(result).toEqual(newMaterial);
    expect(capturedBody).toMatchObject({
      typeId: FAKE_TYPE_ID,
      instanceId: FAKE_INSTANCE_ID,
      refreshToken: "refresh-tok",
    });
  });

  it("preserves existing refreshToken when CP response omits it", async () => {
    const fakeFetch = {
      post: async (): Promise<Response> => makeOkResponse({ accessToken: "new-access", grantedScopes: [] }),
      get: async () => {
        throw new Error("unexpected");
      },
      delete: async () => {
        throw new Error("unexpected");
      },
    };
    const executor = makeExecutor(fakeFetch);

    const result = await executor.refresh({
      typeId: FAKE_TYPE_ID,
      instanceId: FAKE_INSTANCE_ID,
      material: existingMaterial,
    });

    expect(result.accessToken).toBe("new-access");
    expect(result.refreshToken).toBe("refresh-tok"); // preserved from existingMaterial
  });

  it("throws ManagedOAuthRefreshInvalidGrantError on HTTP 410", async () => {
    const responses = new Map([[`${CONTROL_PLANE_URL}/internal/oauth/refresh`, makeErrorResponse(410)]]);
    const executor = makeExecutor(makeFakePairedFetch(responses));

    await expect(
      executor.refresh({ typeId: FAKE_TYPE_ID, instanceId: FAKE_INSTANCE_ID, material: existingMaterial }),
    ).rejects.toThrow(ManagedOAuthRefreshInvalidGrantError);
  });

  it("throws Error with status on other non-2xx responses", async () => {
    const responses = new Map([[`${CONTROL_PLANE_URL}/internal/oauth/refresh`, makeErrorResponse(503)]]);
    const executor = makeExecutor(makeFakePairedFetch(responses));

    await expect(
      executor.refresh({ typeId: FAKE_TYPE_ID, instanceId: FAKE_INSTANCE_ID, material: existingMaterial }),
    ).rejects.toThrow(/ManagedOAuthFlowExecutor.refresh failed: 503/);
  });

  it("throws when no refresh token is present in material", async () => {
    const fakeFetch = {
      post: async () => makeOkResponse({}),
      get: async () => {
        throw new Error("unexpected");
      },
      delete: async () => {
        throw new Error("unexpected");
      },
    };
    const executor = makeExecutor(fakeFetch);
    const noRefresh: OAuthMaterial = { accessToken: "at", grantedScopes: [] };

    await expect(
      executor.refresh({ typeId: FAKE_TYPE_ID, instanceId: FAKE_INSTANCE_ID, material: noRefresh }),
    ).rejects.toThrow("ManagedOAuthFlowExecutor.refresh: no refresh token available");
  });
});
