import { describe, expect, it, vi, afterEach } from "vitest";
import { LocalOAuthFlowExecutor } from "../../src/credentials/LocalOAuthFlowExecutor";
import type { OAuthMaterial } from "@codemation/core";
import type { CredentialFieldEnvOverlayService } from "../../src/domain/credentials/CredentialFieldEnvOverlayService";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const FAKE_TYPE_ID = "oauth.google.gmail";
const FAKE_INSTANCE_ID = "inst-abc-123";

const fakeTypeDefinition = {
  typeId: FAKE_TYPE_ID,
  displayName: "Gmail OAuth",
  auth: {
    kind: "oauth2" as const,
    providerId: "google",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://mail.google.com/"],
  },
  publicFields: [{ key: "clientId", label: "Client ID", type: "string" as const }],
  secretFields: [{ key: "clientSecret", label: "Client Secret", type: "password" as const }],
};

const fakeCredentialType = {
  definition: fakeTypeDefinition,
  createSession: async () => ({}),
  test: async () => ({ status: "unknown" as const }),
};

const fakeInstance = {
  instanceId: FAKE_INSTANCE_ID,
  typeId: FAKE_TYPE_ID,
  displayName: "My Gmail",
  sourceKind: "db" as const,
  publicConfig: { clientId: "client-id-123" },
  secretRef: { kind: "db" as const },
  tags: [],
  setupStatus: "draft" as const,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const fakeSecretMaterial = { clientSecret: "secret-abc" };

/** Fixed point in time used as the injected clock's `now()` return value. */
const FIXED_BASE_DATE = new Date("2026-01-15T12:00:00.000Z");

function makeClock(now = FIXED_BASE_DATE) {
  return { now: () => now };
}

function makeRegistry(type = fakeCredentialType) {
  return {
    getCredentialType: (typeId: string) => (typeId === FAKE_TYPE_ID ? type : undefined),
  };
}

function makeStore(instance = fakeInstance) {
  return {
    getInstance: async (id: string) => (id === FAKE_INSTANCE_ID ? instance : undefined),
  };
}

function makeMaterialResolver(material = fakeSecretMaterial) {
  return {
    resolveMaterial: async () => material,
  };
}

function makeOAuth2ProviderRegistry() {
  return {
    resolve: (_def: unknown, _pub: unknown) => ({
      providerId: "google",
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
    }),
    resolveClientId: (_auth: unknown, publicConfig: Record<string, unknown>) => String(publicConfig.clientId ?? ""),
    resolveClientSecretFieldKey: (_auth: unknown) => "clientSecret",
  };
}

/** Stub overlay service that passes public config and material through unchanged. */
const passthroughOverlayService: Pick<CredentialFieldEnvOverlayService, "apply" | "isFieldResolvedFromEnv"> = {
  apply: ({ publicConfig, material }) => ({ resolvedPublicConfig: publicConfig, resolvedMaterial: material }),
  isFieldResolvedFromEnv: () => false,
};

function makeExecutor(
  overrides: {
    registry?: ReturnType<typeof makeRegistry>;
    store?: ReturnType<typeof makeStore>;
    materialResolver?: ReturnType<typeof makeMaterialResolver>;
    providerRegistry?: ReturnType<typeof makeOAuth2ProviderRegistry>;
    clock?: ReturnType<typeof makeClock>;
  } = {},
): LocalOAuthFlowExecutor {
  return new LocalOAuthFlowExecutor(
    (overrides.registry ?? makeRegistry()) as never,
    (overrides.store ?? makeStore()) as never,
    (overrides.materialResolver ?? makeMaterialResolver()) as never,
    (overrides.providerRegistry ?? makeOAuth2ProviderRegistry()) as never,
    passthroughOverlayService as never,
    (overrides.clock ?? makeClock()) as never,
  );
}

// ---------------------------------------------------------------------------
// start()
// ---------------------------------------------------------------------------

describe("LocalOAuthFlowExecutor.start", () => {
  it("returns a consentUrl and stateToken", async () => {
    const executor = makeExecutor();
    const result = await executor.start({
      typeId: FAKE_TYPE_ID,
      scopes: ["https://mail.google.com/"],
      redirectUri: "http://localhost:3000/api/oauth2/callback",
      instanceId: FAKE_INSTANCE_ID,
    });
    expect(result.stateToken).toBeTruthy();
    expect(result.consentUrl).toContain("accounts.google.com");
    expect(result.consentUrl).toContain("client_id=client-id-123");
    expect(result.consentUrl).toContain("response_type=code");
    expect(result.consentUrl).toContain("code_challenge_method=S256");
    expect(result.consentUrl).toContain("access_type=offline");
    expect(result.consentUrl).toContain("prompt=consent");
    expect(result.consentUrl).toContain(encodeURIComponent("http://localhost:3000/api/oauth2/callback"));
  });

  it("includes the requested scopes in the consentUrl", async () => {
    const executor = makeExecutor();
    const result = await executor.start({
      typeId: FAKE_TYPE_ID,
      scopes: ["email", "profile"],
      redirectUri: "http://localhost:3000/api/oauth2/callback",
      instanceId: FAKE_INSTANCE_ID,
    });
    const params = new URL(result.consentUrl).searchParams;
    const scope = params.get("scope") ?? "";
    expect(scope).toContain("email");
    expect(scope).toContain("profile");
  });

  it("falls back to type default scopes when scopes array is empty", async () => {
    const executor = makeExecutor();
    const result = await executor.start({
      typeId: FAKE_TYPE_ID,
      scopes: [],
      redirectUri: "http://localhost:3000/api/oauth2/callback",
      instanceId: FAKE_INSTANCE_ID,
    });
    expect(decodeURIComponent(result.consentUrl)).toContain("https://mail.google.com/");
  });

  it("throws when instanceId is missing", async () => {
    const executor = makeExecutor();
    await expect(
      executor.start({
        typeId: FAKE_TYPE_ID,
        scopes: [],
        redirectUri: "http://localhost:3000/api/oauth2/callback",
      }),
    ).rejects.toThrow("LocalOAuthFlowExecutor.start requires instanceId");
  });

  it("throws when instance is not found", async () => {
    const store = { getInstance: async () => undefined };
    const executor = makeExecutor({ store: store as never });
    await expect(
      executor.start({
        typeId: FAKE_TYPE_ID,
        scopes: [],
        redirectUri: "http://localhost:3000/api/oauth2/callback",
        instanceId: "nonexistent",
      }),
    ).rejects.toThrow(/credential instance not found/);
  });

  it("throws when credential type is unknown", async () => {
    const registry = { getCredentialType: () => undefined };
    const executor = makeExecutor({ registry: registry as never });
    await expect(
      executor.start({
        typeId: FAKE_TYPE_ID,
        scopes: [],
        redirectUri: "http://localhost:3000/api/oauth2/callback",
        instanceId: FAKE_INSTANCE_ID,
      }),
    ).rejects.toThrow(/unknown credential type/);
  });
});

// ---------------------------------------------------------------------------
// lookupInstanceId()
// ---------------------------------------------------------------------------

describe("LocalOAuthFlowExecutor.lookupInstanceId", () => {
  it("returns the instanceId for a pending stateToken", async () => {
    const executor = makeExecutor();
    const { stateToken } = await executor.start({
      typeId: FAKE_TYPE_ID,
      scopes: [],
      redirectUri: "http://localhost:3000/api/credentials/oauth/callback",
      instanceId: FAKE_INSTANCE_ID,
    });
    expect(executor.lookupInstanceId(stateToken)).toBe(FAKE_INSTANCE_ID);
  });

  it("returns undefined for an unknown stateToken", () => {
    const executor = makeExecutor();
    expect(executor.lookupInstanceId("no-such-token")).toBeUndefined();
  });

  it("returns undefined after the stateToken has been consumed by completeCallback", async () => {
    const executor = makeExecutor();
    const { stateToken } = await executor.start({
      typeId: FAKE_TYPE_ID,
      scopes: [],
      redirectUri: "http://localhost:3000/api/credentials/oauth/callback",
      instanceId: FAKE_INSTANCE_ID,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ access_token: "at", scope: "s" }),
    } as Response);

    await executor.completeCallback({ stateToken, code: "code" });
    expect(executor.lookupInstanceId(stateToken)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// completeCallback()
// ---------------------------------------------------------------------------

describe("LocalOAuthFlowExecutor.completeCallback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exchanges code for OAuthMaterial", async () => {
    const executor = makeExecutor();
    const { stateToken } = await executor.start({
      typeId: FAKE_TYPE_ID,
      scopes: ["https://mail.google.com/"],
      redirectUri: "http://localhost:3000/api/oauth2/callback",
      instanceId: FAKE_INSTANCE_ID,
    });

    const tokenResponse = {
      access_token: "access-tok",
      refresh_token: "refresh-tok",
      expires_in: 3600,
      scope: "https://mail.google.com/",
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify(tokenResponse),
    } as Response);

    const material = await executor.completeCallback({ stateToken, code: "auth-code-xyz" });
    expect(material.accessToken).toBe("access-tok");
    expect(material.refreshToken).toBe("refresh-tok");
    expect(material.grantedScopes).toContain("https://mail.google.com/");
    expect(material.expiresAt).toBeDefined();
  });

  it("throws when stateToken is absent", async () => {
    const executor = makeExecutor();
    await expect(executor.completeCallback({ stateToken: "no-such-token", code: "code" })).rejects.toThrow(
      /state token not found/,
    );
  });

  it("throws when state token has expired", async () => {
    // Use a mutable clock so we can advance it past the 10-minute TTL after start().
    const baseMs = FIXED_BASE_DATE.getTime();
    const controllableDate = { value: new Date(baseMs) };
    const clock = { now: () => controllableDate.value };
    const executor = makeExecutor({ clock: clock as never });

    const { stateToken } = await executor.start({
      typeId: FAKE_TYPE_ID,
      scopes: [],
      redirectUri: "http://localhost:3000/api/oauth2/callback",
      instanceId: FAKE_INSTANCE_ID,
    });

    // Advance past the 10-minute TTL.
    controllableDate.value = new Date(baseMs + 11 * 60 * 1_000);

    await expect(executor.completeCallback({ stateToken, code: "code" })).rejects.toThrow(/expired/);
  });

  it("sends correct POST body to tokenUrl", async () => {
    const executor = makeExecutor();
    const { stateToken } = await executor.start({
      typeId: FAKE_TYPE_ID,
      scopes: [],
      redirectUri: "http://localhost:3000/api/oauth2/callback",
      instanceId: FAKE_INSTANCE_ID,
    });

    let capturedBody = "";
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (_url, init) => {
      capturedBody = (init?.body as string) ?? "";
      return {
        ok: true,
        text: async () => JSON.stringify({ access_token: "at", scope: "s" }),
      } as Response;
    });

    await executor.completeCallback({ stateToken, code: "the-code" });

    const params = new URLSearchParams(capturedBody);
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("the-code");
    expect(params.get("client_id")).toBe("client-id-123");
    expect(params.get("client_secret")).toBe("secret-abc");
    expect(params.get("redirect_uri")).toBe("http://localhost:3000/api/oauth2/callback");
    expect(params.get("code_verifier")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// refresh()
// ---------------------------------------------------------------------------

describe("LocalOAuthFlowExecutor.refresh", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const existingMaterial: OAuthMaterial = {
    accessToken: "old-access",
    refreshToken: "refresh-tok",
    grantedScopes: ["https://mail.google.com/"],
  };

  it("exchanges refresh token for new OAuthMaterial", async () => {
    const executor = makeExecutor();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 3600,
          scope: "https://mail.google.com/",
        }),
    } as Response);

    const result = await executor.refresh({
      typeId: FAKE_TYPE_ID,
      instanceId: FAKE_INSTANCE_ID,
      material: existingMaterial,
    });

    expect(result.accessToken).toBe("new-access");
    expect(result.refreshToken).toBe("new-refresh");
    expect(result.expiresAt).toBeDefined();
  });

  it("preserves existing refreshToken when provider omits it from response", async () => {
    const executor = makeExecutor();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          access_token: "new-access",
          expires_in: 3600,
          scope: "https://mail.google.com/",
          // no refresh_token in response
        }),
    } as Response);

    const result = await executor.refresh({
      typeId: FAKE_TYPE_ID,
      instanceId: FAKE_INSTANCE_ID,
      material: existingMaterial,
    });

    expect(result.accessToken).toBe("new-access");
    expect(result.refreshToken).toBe("refresh-tok"); // preserved from existingMaterial
  });

  it("sends correct POST body to tokenUrl", async () => {
    const executor = makeExecutor();
    let capturedBody = "";

    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (_url, init) => {
      capturedBody = (init?.body as string) ?? "";
      return {
        ok: true,
        text: async () => JSON.stringify({ access_token: "at", scope: "s" }),
      } as Response;
    });

    await executor.refresh({
      typeId: FAKE_TYPE_ID,
      instanceId: FAKE_INSTANCE_ID,
      material: existingMaterial,
    });

    const params = new URLSearchParams(capturedBody);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("refresh-tok");
    expect(params.get("client_id")).toBe("client-id-123");
    expect(params.get("client_secret")).toBe("secret-abc");
  });

  it("throws when no refresh token is present in material", async () => {
    const executor = makeExecutor();
    const noRefresh: OAuthMaterial = { accessToken: "at", grantedScopes: [] };
    await expect(
      executor.refresh({ typeId: FAKE_TYPE_ID, instanceId: FAKE_INSTANCE_ID, material: noRefresh }),
    ).rejects.toThrow(/no refresh token/);
  });
});
