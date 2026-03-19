// @vitest-environment node

import path from "node:path";
import { createWorkflowBuilder, ManualTrigger } from "@codemation/core-nodes";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { CredentialInstanceDto, CredentialInstanceWithSecretsDto } from "../../src/application/contracts/CredentialContracts";
import type { CodemationBinding } from "../../src/presentation/config/CodemationBinding";
import type { CodemationBootContext, CodemationBootHook } from "../../src/presentation/config/CodemationConfig";
import { ApiPaths } from "../../src/presentation/http/ApiPaths";
import { PrismaClient } from "../../src/infrastructure/persistence/generated/prisma-client/client.js";
import { FrontendHttpIntegrationHarness } from "./testkit/FrontendHttpIntegrationHarness";
import { PostgresIntegrationDatabase } from "./testkit/PostgresIntegrationDatabase";
import { PostgresRollbackTransaction } from "./testkit/PostgresRollbackTransaction";

const testCredentialTypeId = "test.apiKey";
const testSecretValue = "secret-value-12345";

class TestCredentialBootHook implements CodemationBootHook {
  async boot(context: CodemationBootContext): Promise<void> {
    context.application.registerCredentialType({
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
  }
}

class CredentialIntegrationFixture {
  static readonly workflowId = "wf.credential.integration";

  static createWorkflow() {
    return createWorkflowBuilder({
      id: this.workflowId,
      name: "Credential integration workflow",
    })
      .trigger(new ManualTrigger("Manual", "trigger"))
      .build();
  }

  static async createHarness(
    database: PostgresIntegrationDatabase,
    transaction: PostgresRollbackTransaction,
  ): Promise<FrontendHttpIntegrationHarness> {
    const config = {
      workflows: [this.createWorkflow()],
      bootHook: TestCredentialBootHook,
      runtime: {
        eventBus: { kind: "memory" as const },
        scheduler: { kind: "local" as const },
      },
    };
    const harness = new FrontendHttpIntegrationHarness({
      config,
      consumerRoot: path.resolve(import.meta.dirname, "../../.."),
      env: {
        DATABASE_URL: database.databaseUrl,
        CODEMATION_CREDENTIALS_MASTER_KEY: "test-master-key-for-integration-tests-only",
        TEST_CREDENTIAL_API_KEY: "env-resolved-secret-value",
      },
      bindings: [
        {
          token: PrismaClient,
          useFactory: () => transaction.getPrismaClient(),
        },
      ],
    });
    await harness.start();
    return harness;
  }
}

describe("credential instances http integration", () => {
  let sharedDatabase: PostgresIntegrationDatabase | null = null;
  let transaction: PostgresRollbackTransaction | null = null;

  beforeAll(async () => {
    sharedDatabase = await PostgresIntegrationDatabase.create();
    transaction = await sharedDatabase!.beginRollbackTransaction();
  });

  afterEach(async () => {
    if (transaction) {
      await transaction.rollback();
      transaction = await sharedDatabase!.beginRollbackTransaction();
    }
  });

  afterAll(async () => {
    if (transaction) {
      await transaction.rollback();
      transaction = null;
    }
    if (sharedDatabase) {
      await sharedDatabase.close();
      sharedDatabase = null;
    }
  });

  it("returns credential instance without secrets by default", async () => {
    const harness = await CredentialIntegrationFixture.createHarness(sharedDatabase!, transaction!);

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
    const harness = await CredentialIntegrationFixture.createHarness(sharedDatabase!, transaction!);

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
    const harness = await CredentialIntegrationFixture.createHarness(sharedDatabase!, transaction!);

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
});
