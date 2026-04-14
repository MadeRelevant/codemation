// @vitest-environment node

import type { CredentialRequirement } from "@codemation/core";
import { createWorkflowBuilder, ManualTrigger, MapData } from "@codemation/core-nodes";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type {
  CredentialInstanceDto,
  CredentialInstanceWithSecretsDto,
  WorkflowCredentialHealthDto,
} from "../../src/application/contracts/CredentialContractsRegistry";
import { ApplicationTokens } from "../../src/applicationTokens";
import { CredentialSecretCipher } from "../../src/domain/credentials/CredentialServices";
import type { CodemationAppContext } from "../../src/presentation/config/CodemationAppContext";
import { ApiPaths } from "../../src/presentation/http/ApiPaths";
import { FrontendHttpIntegrationHarness } from "./testkit/FrontendHttpIntegrationHarness";
import { IntegrationTestAuth } from "./testkit/IntegrationTestAuth";
import type { IntegrationDatabase } from "./testkit/IntegrationDatabaseFactory";
import { IntegrationTestDatabaseSession } from "./testkit/IntegrationTestDatabaseSession";
import { mergeIntegrationDatabaseRuntime } from "./testkit/mergeIntegrationDatabaseRuntime";
import type { PostgresRollbackTransaction } from "./testkit/PostgresRollbackTransaction";

const testCredentialTypeId = "test.apiKey";
const testOAuthCredentialTypeId = "test.oauth";
const testSecretValue = "secret-value-12345";
const testMasterKey = "test-master-key-for-integration-tests-only";

class TestCredentialRegistrar {
  register(context: CodemationAppContext): void {
    context.registerCredentialType({
      definition: {
        typeId: testCredentialTypeId,
        displayName: "Test API key",
        description: "Minimal test credential type",
        secretFields: [{ key: "apiKey", label: "API key", type: "password", required: true }],
        supportedSourceKinds: ["db", "env"],
      },
      createSession: async (args) => String(args.material.apiKey ?? ""),
      test: async (args) => ({
        status: String(args.material.apiKey ?? "").length > 0 ? "healthy" : "failing",
        message: "Test",
        testedAt: new Date().toISOString(),
      }),
    });
    context.registerCredentialType({
      definition: {
        typeId: testOAuthCredentialTypeId,
        displayName: "Test OAuth",
        publicFields: [
          {
            key: "clientId",
            label: "Client ID",
            type: "string",
            required: true,
            envVarName: "TEST_OAUTH_INTEGRATION_CLIENT_ID",
          },
        ],
        secretFields: [
          {
            key: "clientSecret",
            label: "Client Secret",
            type: "password",
            required: true,
            envVarName: "TEST_OAUTH_INTEGRATION_CLIENT_SECRET",
          },
        ],
        supportedSourceKinds: ["db"],
        auth: {
          kind: "oauth2",
          providerId: "google",
          scopes: ["scope.one", "scope.two"],
        },
      },
      createSession: async (args) => args.material,
      test: async () => ({
        status: "healthy",
        testedAt: new Date().toISOString(),
      }),
    });
  }
}

class CredentialBindingProbeMap extends MapData<unknown, unknown> {
  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    return [
      {
        slotKey: "api",
        label: "API key",
        acceptedTypes: [testCredentialTypeId],
      },
    ];
  }
}

class CredentialIntegrationFixture {
  static readonly workflowId = "wf.credential.integration";
  static readonly bindingWorkflowId = "wf.credential.binding";

  static createWorkflow() {
    return createWorkflowBuilder({
      id: this.workflowId,
      name: "Credential integration workflow",
    })
      .trigger(new ManualTrigger("Manual", "trigger"))
      .build();
  }

  static createWorkflowWithCredentialSlot() {
    return createWorkflowBuilder({
      id: this.bindingWorkflowId,
      name: "Credential binding probe workflow",
    })
      .trigger(new ManualTrigger("Start", "trig"))
      .then(new CredentialBindingProbeMap("Probe", (item) => item.json, { id: "probe-node-1" }))
      .build();
  }

  static async createHarness(
    database: IntegrationDatabase,
    transaction: PostgresRollbackTransaction,
    envOverrides?: Readonly<NodeJS.ProcessEnv>,
  ): Promise<FrontendHttpIntegrationHarness> {
    const config = mergeIntegrationDatabaseRuntime(
      {
        workflows: [this.createWorkflow(), this.createWorkflowWithCredentialSlot()],
        runtime: {
          eventBus: { kind: "memory" as const },
          scheduler: { kind: "local" as const },
        },
        auth: IntegrationTestAuth.developmentBypass,
      },
      database,
    );
    const harness = new FrontendHttpIntegrationHarness({
      config,
      consumerRoot: path.resolve(import.meta.dirname, "../../.."),
      env: {
        CODEMATION_CREDENTIALS_MASTER_KEY: testMasterKey,
        TEST_CREDENTIAL_API_KEY: "env-resolved-secret-value",
        TEST_OAUTH_INTEGRATION_CLIENT_ID: "oauth-client-from-env",
        TEST_OAUTH_INTEGRATION_CLIENT_SECRET: "oauth-secret-from-env",
        ...envOverrides,
      },
      register: (context) => {
        new TestCredentialRegistrar().register(context);
        context.registerFactory(ApplicationTokens.PrismaClient, () => transaction.getPrismaClient());
      },
    });
    await harness.start();
    return harness;
  }
}

describe("credential instances http integration", () => {
  const session = new IntegrationTestDatabaseSession();

  beforeAll(async () => {
    await session.start();
  });

  afterEach(async () => {
    await session.afterEach();
  });

  afterAll(async () => {
    await session.dispose();
  });

  it("returns credential instance without secrets by default", async () => {
    const harness = await CredentialIntegrationFixture.createHarness(session.database!, session.transaction!);

    const createResponse = await harness.requestJson<CredentialInstanceDto>({
      method: "POST",
      url: ApiPaths.credentialInstances(),
      payload: {
        typeId: testCredentialTypeId,
        displayName: "Test credential",
        sourceKind: "db",
        secretConfig: { apiKey: testSecretValue },
      },
    });

    const getResponse = await harness.request({
      method: "GET",
      url: ApiPaths.credentialInstance(createResponse.instanceId),
    });

    expect(getResponse.statusCode).toBe(200);
    const instance = getResponse.json<CredentialInstanceDto>();
    expect(instance.instanceId).toBe(createResponse.instanceId);
    expect(instance.displayName).toBe("Test credential");
    expect(instance.sourceKind).toBe("db");
    expect("secretConfig" in instance).toBe(false);
    expect("envSecretRefs" in instance).toBe(false);
  });

  it("returns credential instance with secrets when withSecrets=1", async () => {
    const harness = await CredentialIntegrationFixture.createHarness(session.database!, session.transaction!);

    const createResponse = await harness.requestJson<CredentialInstanceDto>({
      method: "POST",
      url: ApiPaths.credentialInstances(),
      payload: {
        typeId: testCredentialTypeId,
        displayName: "Test credential with secrets",
        sourceKind: "db",
        secretConfig: { apiKey: testSecretValue },
      },
    });

    const getResponse = await harness.request({
      method: "GET",
      url: ApiPaths.credentialInstance(createResponse.instanceId, true),
    });

    expect(getResponse.statusCode).toBe(200);
    const instance = getResponse.json<CredentialInstanceWithSecretsDto>();
    expect(instance.instanceId).toBe(createResponse.instanceId);
    expect(instance.secretConfig).toEqual({ apiKey: testSecretValue });
    expect(instance.envSecretRefs).toBeUndefined();
  });

  it("returns env credential with envSecretRefs and resolved secretConfig when withSecrets=1", async () => {
    const harness = await CredentialIntegrationFixture.createHarness(session.database!, session.transaction!);

    const createResponse = await harness.requestJson<CredentialInstanceDto>({
      method: "POST",
      url: ApiPaths.credentialInstances(),
      payload: {
        typeId: testCredentialTypeId,
        displayName: "Test env credential",
        sourceKind: "env",
        envSecretRefs: { apiKey: "TEST_CREDENTIAL_API_KEY" },
      },
    });

    const getResponse = await harness.request({
      method: "GET",
      url: ApiPaths.credentialInstance(createResponse.instanceId, true),
    });

    expect(getResponse.statusCode).toBe(200);
    const instance = getResponse.json<CredentialInstanceWithSecretsDto>();
    expect(instance.instanceId).toBe(createResponse.instanceId);
    expect(instance.envSecretRefs).toEqual({ apiKey: "TEST_CREDENTIAL_API_KEY" });
    expect(instance.secretConfig).toBeDefined();
    expect(typeof instance.secretConfig?.apiKey).toBe("string");
  });

  it("returns credential field env status for registered types", async () => {
    const harness = await CredentialIntegrationFixture.createHarness(session.database!, session.transaction!);

    const response = await harness.request({
      method: "GET",
      url: ApiPaths.credentialsEnvStatus(),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<Readonly<Record<string, boolean>>>();
    expect(body.TEST_OAUTH_INTEGRATION_CLIENT_ID).toBe(true);
    expect(body.TEST_OAUTH_INTEGRATION_CLIENT_SECRET).toBe(true);
  });

  it("creates OAuth credential without stored client id and secret when env provides values", async () => {
    const harness = await CredentialIntegrationFixture.createHarness(session.database!, session.transaction!);

    const createResponse = await harness.requestJson<CredentialInstanceDto>({
      method: "POST",
      url: ApiPaths.credentialInstances(),
      payload: {
        typeId: testOAuthCredentialTypeId,
        displayName: "OAuth env-backed",
        sourceKind: "db",
        publicConfig: {},
        secretConfig: {},
      },
    });

    expect(createResponse.typeId).toBe(testOAuthCredentialTypeId);

    const getResponse = await harness.request({
      method: "GET",
      url: ApiPaths.credentialInstance(createResponse.instanceId, true),
    });

    expect(getResponse.statusCode).toBe(200);
    const instance = getResponse.json<CredentialInstanceWithSecretsDto>();
    expect(instance.publicConfig.clientId).toBeUndefined();
    expect(instance.secretConfig?.clientSecret).toBeUndefined();
  });

  it("uses env-resolved client_id in OAuth2 auth redirect when instance omits stored client id", async () => {
    const harness = await CredentialIntegrationFixture.createHarness(session.database!, session.transaction!);

    const createResponse = await harness.requestJson<CredentialInstanceDto>({
      method: "POST",
      url: ApiPaths.credentialInstances(),
      payload: {
        typeId: testOAuthCredentialTypeId,
        displayName: "OAuth redirect env",
        sourceKind: "db",
        publicConfig: {},
        secretConfig: {},
      },
    });

    const authResponse = await harness.request({
      method: "GET",
      url: ApiPaths.oauth2Auth(createResponse.instanceId),
    });

    expect(authResponse.statusCode).toBe(302);
    const locationHeader = String(authResponse.header("location"));
    const url = new URL(locationHeader);
    expect(url.searchParams.get("client_id")).toBe("oauth-client-from-env");
  });

  it("creates an OAuth2 auth redirect and persists state", async () => {
    const harness = await CredentialIntegrationFixture.createHarness(session.database!, session.transaction!);

    const createResponse = await harness.requestJson<CredentialInstanceDto>({
      method: "POST",
      url: ApiPaths.credentialInstances(),
      payload: {
        typeId: testOAuthCredentialTypeId,
        displayName: "OAuth credential",
        sourceKind: "db",
        publicConfig: { clientId: "google-client-id" },
        secretConfig: { clientSecret: "google-client-secret" },
      },
    });

    const authResponse = await harness.request({
      method: "GET",
      url: ApiPaths.oauth2Auth(createResponse.instanceId),
    });

    expect(authResponse.statusCode).toBe(302);
    const locationHeader = authResponse.header("location");
    expect(typeof locationHeader).toBe("string");
    expect(String(locationHeader)).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(String(locationHeader)).toContain("state=");

    const persistedStates = await session.transaction!.getPrismaClient().credentialOAuth2State.findMany();
    expect(persistedStates).toHaveLength(1);
    expect(persistedStates[0]?.instanceId).toBe(createResponse.instanceId);
  });

  it("stores OAuth2 token material and preserves the refresh token on reconnect", async () => {
    const harness = await CredentialIntegrationFixture.createHarness(session.database!, session.transaction!);
    const fetchMock = vi.fn();
    const priorFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;
    try {
      const createResponse = await harness.requestJson<CredentialInstanceDto>({
        method: "POST",
        url: ApiPaths.credentialInstances(),
        payload: {
          typeId: testOAuthCredentialTypeId,
          displayName: "OAuth callback credential",
          sourceKind: "db",
          publicConfig: { clientId: "google-client-id" },
          secretConfig: { clientSecret: "google-client-secret" },
        },
      });

      const firstAuthResponse = await harness.request({
        method: "GET",
        url: ApiPaths.oauth2Auth(createResponse.instanceId),
      });
      const firstLocation = String(firstAuthResponse.header("location"));
      const firstState = new URL(firstLocation).searchParams.get("state");

      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            access_token: "access-token-1",
            refresh_token: "refresh-token-1",
            scope: "scope.one scope.two",
            expires_in: 3600,
            token_type: "Bearer",
          }),
      });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ email: "user@example.com" }),
      });

      const firstCallbackResponse = await harness.request({
        method: "GET",
        url: `/api/oauth2/callback?code=first-code&state=${encodeURIComponent(firstState ?? "")}`,
      });

      expect(firstCallbackResponse.statusCode).toBe(200);
      expect(firstCallbackResponse.body).toContain("oauth2.connected");

      const firstInstanceResponse = await harness.request({
        method: "GET",
        url: ApiPaths.credentialInstance(createResponse.instanceId),
      });
      const firstInstance = firstInstanceResponse.json<CredentialInstanceDto>();
      expect(firstInstance.oauth2Connection?.status).toBe("connected");
      expect(firstInstance.oauth2Connection?.connectedEmail).toBe("user@example.com");

      const secondAuthResponse = await harness.request({
        method: "GET",
        url: ApiPaths.oauth2Auth(createResponse.instanceId),
      });
      const secondLocation = String(secondAuthResponse.header("location"));
      const secondState = new URL(secondLocation).searchParams.get("state");

      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            access_token: "access-token-2",
            scope: "scope.one scope.two",
            expires_in: 3600,
            token_type: "Bearer",
          }),
      });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ email: "user@example.com" }),
      });

      const secondCallbackResponse = await harness.request({
        method: "GET",
        url: `/api/oauth2/callback?code=second-code&state=${encodeURIComponent(secondState ?? "")}`,
      });

      expect(secondCallbackResponse.statusCode).toBe(200);

      const storedMaterial = await session.transaction!.getPrismaClient().credentialOAuth2Material.findUnique({
        where: { instanceId: createResponse.instanceId },
      });
      expect(storedMaterial).toBeTruthy();

      const cipher = new CredentialSecretCipher({
        consumerRoot: import.meta.dirname,
        repoRoot: import.meta.dirname,
        env: {
          CODEMATION_CREDENTIALS_MASTER_KEY: testMasterKey,
        },
        workflowSources: [],
        workflows: [],
        containerRegistrations: [],
        credentialTypes: [],
        plugins: [],
        hasConfiguredCredentialSessionServiceRegistration: false,
        persistence: { kind: "none" },
        scheduler: {
          kind: "local",
          workerQueues: [],
        },
        eventing: {
          kind: "memory",
        },
        whitelabel: {},
        webSocketPort: 3001,
        webSocketBindHost: "0.0.0.0",
      });
      const decrypted = cipher.decrypt({
        encryptedJson: storedMaterial!.encryptedJson,
        encryptionKeyId: storedMaterial!.encryptionKeyId,
        schemaVersion: storedMaterial!.schemaVersion,
      });
      expect(decrypted.refresh_token).toBe("refresh-token-1");
      expect(decrypted.access_token).toBe("access-token-2");
    } finally {
      globalThis.fetch = priorFetch;
    }
  });

  it("rejects OAuth2 auth when instanceId is missing", async () => {
    const harness = await CredentialIntegrationFixture.createHarness(session.database!, session.transaction!);

    const response = await harness.request({
      method: "GET",
      url: "/api/oauth2/auth",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error?: string }>().error).toContain("instanceId");
  });

  it("returns OAuth2 callback error HTML without raw script-breaking markup in inline script", async () => {
    const harness = await CredentialIntegrationFixture.createHarness(session.database!, session.transaction!);
    const fetchMock = vi.fn();
    const priorFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;
    try {
      const createResponse = await harness.requestJson<CredentialInstanceDto>({
        method: "POST",
        url: ApiPaths.credentialInstances(),
        payload: {
          typeId: testOAuthCredentialTypeId,
          displayName: "OAuth evil message",
          sourceKind: "db",
          publicConfig: { clientId: "google-client-id" },
          secretConfig: { clientSecret: "google-client-secret" },
        },
      });

      const authResponse = await harness.request({
        method: "GET",
        url: ApiPaths.oauth2Auth(createResponse.instanceId),
      });
      const state = new URL(String(authResponse.header("location"))).searchParams.get("state");

      fetchMock.mockResolvedValueOnce({
        ok: false,
        text: async () =>
          JSON.stringify({
            error: "invalid_grant",
            error_description: "evil</script><script>alert(1)</script>",
          }),
      });

      const callbackResponse = await harness.request({
        method: "GET",
        url: `/api/oauth2/callback?code=bad-code&state=${encodeURIComponent(state ?? "")}`,
      });

      expect(callbackResponse.statusCode).toBe(400);
      const body = callbackResponse.body;
      expect(body).toContain("oauth2.error");
      expect(body).toMatch(/\\u003[Cc]\\u002[Ff]script/);
      expect(body).not.toContain("</script><script>alert(1)</script>");
    } finally {
      globalThis.fetch = priorFetch;
    }
  });

  it("disconnects OAuth2 for a credential instance", async () => {
    const harness = await CredentialIntegrationFixture.createHarness(session.database!, session.transaction!);
    const fetchMock = vi.fn();
    const priorFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;
    try {
      const createResponse = await harness.requestJson<CredentialInstanceDto>({
        method: "POST",
        url: ApiPaths.credentialInstances(),
        payload: {
          typeId: testOAuthCredentialTypeId,
          displayName: "OAuth disconnect",
          sourceKind: "db",
          publicConfig: { clientId: "google-client-id" },
          secretConfig: { clientSecret: "google-client-secret" },
        },
      });

      const authResponse = await harness.request({
        method: "GET",
        url: ApiPaths.oauth2Auth(createResponse.instanceId),
      });
      const oauthState = new URL(String(authResponse.header("location"))).searchParams.get("state");

      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            access_token: "access-token-dc",
            refresh_token: "refresh-token-dc",
            scope: "scope.one",
            expires_in: 3600,
            token_type: "Bearer",
          }),
      });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ email: "dc@example.com" }),
      });

      const callbackResponse = await harness.request({
        method: "GET",
        url: `/api/oauth2/callback?code=dc-code&state=${encodeURIComponent(oauthState ?? "")}`,
      });
      expect(callbackResponse.statusCode).toBe(200);

      const disconnectResponse = await harness.request({
        method: "POST",
        url: ApiPaths.oauth2Disconnect(createResponse.instanceId),
      });
      expect(disconnectResponse.statusCode).toBe(200);

      const material = await session.transaction!.getPrismaClient().credentialOAuth2Material.findUnique({
        where: { instanceId: createResponse.instanceId },
      });
      expect(material).toBeNull();

      const after = await harness.request({
        method: "GET",
        url: ApiPaths.credentialInstance(createResponse.instanceId),
      });
      const dto = after.json<CredentialInstanceDto>();
      expect(dto.oauth2Connection?.status).toBe("disconnected");
    } finally {
      globalThis.fetch = priorFetch;
    }
  });

  it("rejects OAuth2 disconnect when instanceId is missing", async () => {
    const harness = await CredentialIntegrationFixture.createHarness(session.database!, session.transaction!);

    const response = await harness.request({
      method: "POST",
      url: "/api/oauth2/disconnect",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error?: string }>().error).toContain("instanceId");
  });

  it("lists credential types", async () => {
    const harness = await CredentialIntegrationFixture.createHarness(session.database!, session.transaction!);

    const response = await harness.request({
      method: "GET",
      url: ApiPaths.credentialTypes(),
    });

    expect(response.statusCode).toBe(200);
    const types = response.json<ReadonlyArray<{ typeId: string }>>();
    const ids = types.map((t) => t.typeId);
    expect(ids).toContain("openai.apiKey");
    expect(ids).toContain(testCredentialTypeId);
    expect(ids).toContain(testOAuthCredentialTypeId);
  });

  it("registers credential types from CodemationConfig.credentialTypes without a boot hook", async () => {
    const consumerTypeId = "consumer.config.credential";
    const harness = new FrontendHttpIntegrationHarness({
      config: mergeIntegrationDatabaseRuntime(
        {
          workflows: [CredentialIntegrationFixture.createWorkflow()],
          runtime: { eventBus: { kind: "memory" as const }, scheduler: { kind: "local" as const } },
          auth: IntegrationTestAuth.developmentBypass,
          credentialTypes: [
            {
              definition: {
                typeId: consumerTypeId,
                displayName: "Consumer config credential",
                secretFields: [{ key: "token", label: "Token", type: "password", required: true }],
                supportedSourceKinds: ["db"],
              },
              createSession: async () => "session",
              test: async () => ({ status: "healthy" as const, testedAt: new Date().toISOString() }),
            },
          ],
        },
        session.database!,
      ),
      consumerRoot: path.resolve(import.meta.dirname, "../../.."),
      env: {
        CODEMATION_CREDENTIALS_MASTER_KEY: testMasterKey,
      },
      register: (context) => {
        context.registerFactory(ApplicationTokens.PrismaClient, () => session.transaction!.getPrismaClient());
      },
    });
    await harness.start();
    try {
      const response = await harness.request({
        method: "GET",
        url: ApiPaths.credentialTypes(),
      });
      expect(response.statusCode).toBe(200);
      const types = response.json<ReadonlyArray<{ typeId: string }>>();
      expect(types.map((t) => t.typeId)).toContain(consumerTypeId);
      expect(types.map((t) => t.typeId)).toContain("openai.apiKey");
    } finally {
      await harness.close();
    }
  });

  it("lists credential instances including created rows", async () => {
    const harness = await CredentialIntegrationFixture.createHarness(session.database!, session.transaction!);

    const empty = await harness.request({ method: "GET", url: ApiPaths.credentialInstances() });
    expect(empty.statusCode).toBe(200);
    expect(empty.json<unknown[]>()).toHaveLength(0);

    const created = await harness.requestJson<CredentialInstanceDto>({
      method: "POST",
      url: ApiPaths.credentialInstances(),
      payload: {
        typeId: testCredentialTypeId,
        displayName: "Listed credential",
        sourceKind: "db",
        secretConfig: { apiKey: testSecretValue },
      },
    });

    const listed = await harness.request({ method: "GET", url: ApiPaths.credentialInstances() });
    expect(listed.statusCode).toBe(200);
    const rows = listed.json<CredentialInstanceDto[]>();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.instanceId).toBe(created.instanceId);
    expect(rows[0]?.displayName).toBe("Listed credential");
  });

  it("returns 404 for an unknown credential instance", async () => {
    const harness = await CredentialIntegrationFixture.createHarness(session.database!, session.transaction!);

    const response = await harness.request({
      method: "GET",
      url: ApiPaths.credentialInstance("no-such-instance-id"),
    });

    expect(response.statusCode).toBe(404);
  });

  it("updates a credential instance via PUT", async () => {
    const harness = await CredentialIntegrationFixture.createHarness(session.database!, session.transaction!);

    const created = await harness.requestJson<CredentialInstanceDto>({
      method: "POST",
      url: ApiPaths.credentialInstances(),
      payload: {
        typeId: testCredentialTypeId,
        displayName: "Before update",
        sourceKind: "db",
        secretConfig: { apiKey: testSecretValue },
      },
    });

    const updated = await harness.requestJson<CredentialInstanceDto>({
      method: "PUT",
      url: ApiPaths.credentialInstance(created.instanceId),
      payload: { displayName: "After update" },
    });

    expect(updated.displayName).toBe("After update");

    const fetched = await harness.request({
      method: "GET",
      url: ApiPaths.credentialInstance(created.instanceId),
    });
    expect(fetched.json<CredentialInstanceDto>().displayName).toBe("After update");
  });

  it("deletes a credential instance", async () => {
    const harness = await CredentialIntegrationFixture.createHarness(session.database!, session.transaction!);

    const created = await harness.requestJson<CredentialInstanceDto>({
      method: "POST",
      url: ApiPaths.credentialInstances(),
      payload: {
        typeId: testCredentialTypeId,
        displayName: "To delete",
        sourceKind: "db",
        secretConfig: { apiKey: testSecretValue },
      },
    });

    const del = await harness.request({
      method: "DELETE",
      url: ApiPaths.credentialInstance(created.instanceId),
    });
    expect(del.statusCode).toBe(200);
    expect(del.json<{ ok?: boolean }>().ok).toBe(true);

    const gone = await harness.request({
      method: "GET",
      url: ApiPaths.credentialInstance(created.instanceId),
    });
    expect(gone.statusCode).toBe(404);
  });

  it("tests a credential instance without mocking fetch", async () => {
    const harness = await CredentialIntegrationFixture.createHarness(session.database!, session.transaction!);

    const created = await harness.requestJson<CredentialInstanceDto>({
      method: "POST",
      url: ApiPaths.credentialInstances(),
      payload: {
        typeId: testCredentialTypeId,
        displayName: "Testable credential",
        sourceKind: "db",
        secretConfig: { apiKey: testSecretValue },
      },
    });

    const testResponse = await harness.request({
      method: "POST",
      url: ApiPaths.credentialInstanceTest(created.instanceId),
    });

    expect(testResponse.statusCode).toBe(200);
    const health = testResponse.json<{ status: string }>();
    expect(health.status).toBe("healthy");
  });

  it("upserts credential binding and reflects the instance on workflow credential health", async () => {
    const harness = await CredentialIntegrationFixture.createHarness(session.database!, session.transaction!);

    const created = await harness.requestJson<CredentialInstanceDto>({
      method: "POST",
      url: ApiPaths.credentialInstances(),
      payload: {
        typeId: testCredentialTypeId,
        displayName: "Bound credential",
        sourceKind: "db",
        secretConfig: { apiKey: testSecretValue },
      },
    });

    const bindResponse = await harness.request({
      method: "PUT",
      url: ApiPaths.credentialBindings(),
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        workflowId: CredentialIntegrationFixture.bindingWorkflowId,
        nodeId: "probe-node-1",
        slotKey: "api",
        instanceId: created.instanceId,
      }),
    });

    expect(bindResponse.statusCode).toBe(200);

    const healthResponse = await harness.request({
      method: "GET",
      url: ApiPaths.workflowCredentialHealth(CredentialIntegrationFixture.bindingWorkflowId),
    });
    expect(healthResponse.statusCode).toBe(200);
    const dto = healthResponse.json<WorkflowCredentialHealthDto>();
    const slot = dto.slots.find((s) => s.nodeId === "probe-node-1" && s.requirement.slotKey === "api");
    expect(slot?.instance?.instanceId).toBe(created.instanceId);
  });

  it("rejects credential create when JSON body is invalid", async () => {
    const harness = await CredentialIntegrationFixture.createHarness(session.database!, session.transaction!);

    const response = await harness.request({
      method: "POST",
      url: ApiPaths.credentialInstances(),
      headers: { "content-type": "application/json" },
      payload: "{not-json",
    });

    expect(response.statusCode).toBe(400);
    const body = response.body;
    try {
      const parsed = JSON.parse(body) as { error?: string };
      expect(parsed.error).toMatch(/Invalid JSON/i);
    } catch {
      expect(body).toMatch(/bad request|invalid json/i);
    }
  });

  it("returns OAuth2 redirect URI for the request origin", async () => {
    const harness = await CredentialIntegrationFixture.createHarness(session.database!, session.transaction!);

    const response = await harness.request({
      method: "GET",
      url: ApiPaths.oauth2RedirectUri(),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ redirectUri: string }>();
    expect(body.redirectUri).toMatch(/\/api\/oauth2\/callback$/);
  });

  it("returns OAuth2 redirect URI when CODEMATION_PUBLIC_BASE_URL omits http scheme", async () => {
    const harness = await CredentialIntegrationFixture.createHarness(session.database!, session.transaction!, {
      CODEMATION_PUBLIC_BASE_URL: "127.0.0.1:5555",
    });

    const response = await harness.request({
      method: "GET",
      url: ApiPaths.oauth2RedirectUri(),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ redirectUri: string }>();
    expect(body.redirectUri).toBe("http://127.0.0.1:5555/api/oauth2/callback");
  });

  it("returns OAuth2 callback error HTML when code and state are missing (no fetch)", async () => {
    const harness = await CredentialIntegrationFixture.createHarness(session.database!, session.transaction!);

    const response = await harness.request({
      method: "GET",
      url: "/api/oauth2/callback",
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toContain("oauth2.error");
    expect(response.body).toContain("code and state");
  });

  it("returns workflow credential health for a registered workflow", async () => {
    const harness = await CredentialIntegrationFixture.createHarness(session.database!, session.transaction!);

    const response = await harness.request({
      method: "GET",
      url: ApiPaths.workflowCredentialHealth(CredentialIntegrationFixture.workflowId),
    });

    expect(response.statusCode).toBe(200);
    const dto = response.json<WorkflowCredentialHealthDto>();
    expect(dto.workflowId).toBe(CredentialIntegrationFixture.workflowId);
    expect(Array.isArray(dto.slots)).toBe(true);
  });
});
