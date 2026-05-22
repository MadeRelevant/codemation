/**
 * Behavioral tests for CredentialTestService.
 * Tests the test() method including the error path (unknown typeId).
 */
import { describe, expect, it } from "vitest";
import { CredentialTestService } from "../../src/domain/credentials/CredentialTestService";
import { CredentialTypeRegistryImpl } from "../../src/domain/credentials/CredentialServices";
import { CredentialFieldEnvOverlayService } from "../../src/domain/credentials/CredentialFieldEnvOverlayService";
import { FakeLoggerFactory } from "../testkit/LoggerTestKit";

function makeRegistry(opts: { typeId?: string; testResult?: { status: string } } = {}) {
  const registry = new CredentialTypeRegistryImpl(new FakeLoggerFactory());
  if (opts.typeId) {
    registry.register({
      definition: {
        typeId: opts.typeId,
        displayName: "Test Type",
        publicFields: [],
        secretFields: [],
        supportedSourceKinds: ["db"],
      },
      createSession: async () => ({}),
      test: async () => opts.testResult ?? { status: "passing" },
    } as never);
  }
  return registry;
}

function makeAppConfig() {
  return { env: {} };
}

function _makeService(
  opts: {
    instance?: Record<string, unknown>;
    typeId?: string;
    testResult?: { status: string };
  } = {},
) {
  const appConfig = makeAppConfig();
  const overlayService = new CredentialFieldEnvOverlayService(appConfig as never);
  const registry = makeRegistry({ typeId: opts.typeId ?? "test.cred", testResult: opts.testResult });

  const instance = opts.instance ?? {
    instanceId: "inst-1",
    typeId: opts.typeId ?? "test.cred",
    displayName: "Test",
    sourceKind: "code",
    publicConfig: {},
    secretRef: { kind: "code", value: {} },
    tags: [],
    setupStatus: "ready",
  };

  const credentialInstanceService = {
    requireInstance: async () => instance,
  };

  const runtimeMaterialService = {
    compose: async () => ({}),
  };

  const credentialStore = {
    saveTestResult: async () => {},
  };

  const sessionService = {
    evictInstance: () => {},
  };

  return new CredentialTestService(
    credentialInstanceService as never,
    runtimeMaterialService as never,
    overlayService as never,
    registry,
    credentialStore as never,
    sessionService as never,
  );
}

describe("CredentialTestService.test", () => {
  it("throws 400 when credential type is unknown", async () => {
    const emptyRegistry = new CredentialTypeRegistryImpl(new FakeLoggerFactory());
    const appConfig = makeAppConfig();
    const overlayService = new CredentialFieldEnvOverlayService(appConfig as never);
    const instance = {
      instanceId: "inst-1",
      typeId: "unknown.type",
      displayName: "Test",
      sourceKind: "code",
      publicConfig: {},
      secretRef: { kind: "code", value: {} },
      tags: [],
    };

    const service = new CredentialTestService(
      { requireInstance: async () => instance } as never,
      { compose: async () => ({}) } as never,
      overlayService as never,
      emptyRegistry,
      { saveTestResult: async () => {} } as never,
      { evictInstance: () => {} } as never,
    );

    await expect(service.test("inst-1" as never)).rejects.toMatchObject({ status: 400 });
  });

  it("calls test on credential type and saves result", async () => {
    const savedResults: object[] = [];
    const appConfig = makeAppConfig();
    const overlayService = new CredentialFieldEnvOverlayService(appConfig as never);
    const registry = new CredentialTypeRegistryImpl(new FakeLoggerFactory());
    registry.register({
      definition: {
        typeId: "test.cred",
        displayName: "Test",
        publicFields: [],
        secretFields: [],
        supportedSourceKinds: ["db"],
      },
      createSession: async () => ({}),
      test: async () => ({ status: "passing", message: "All good" }),
    } as never);

    const instance = {
      instanceId: "inst-1",
      typeId: "test.cred",
      displayName: "Test Cred",
      sourceKind: "code",
      publicConfig: {},
      secretRef: { kind: "code", value: {} },
      tags: [],
    };

    const service = new CredentialTestService(
      { requireInstance: async () => instance } as never,
      { compose: async () => ({}) } as never,
      overlayService as never,
      registry,
      {
        saveTestResult: async (r: object) => {
          savedResults.push(r);
        },
      } as never,
      { evictInstance: () => {} } as never,
    );

    const result = await service.test("inst-1" as never);
    expect(result.status).toBe("passing");
    expect(result.testedAt).toBeDefined();
    expect(savedResults).toHaveLength(1);
  });

  it("uses provided testedAt when credential type sets it", async () => {
    const customTime = "2026-01-01T12:00:00.000Z";
    const appConfig = makeAppConfig();
    const overlayService = new CredentialFieldEnvOverlayService(appConfig as never);
    const registry = new CredentialTypeRegistryImpl(new FakeLoggerFactory());
    registry.register({
      definition: {
        typeId: "test.timed",
        displayName: "Timed",
        publicFields: [],
        secretFields: [],
        supportedSourceKinds: ["db"],
      },
      createSession: async () => ({}),
      test: async () => ({ status: "passing", testedAt: customTime }),
    } as never);

    const instance = {
      instanceId: "inst-time",
      typeId: "test.timed",
      displayName: "Timed Cred",
      sourceKind: "code",
      publicConfig: {},
      secretRef: { kind: "code", value: {} },
      tags: [],
    };

    const service = new CredentialTestService(
      { requireInstance: async () => instance } as never,
      { compose: async () => ({}) } as never,
      overlayService as never,
      registry,
      { saveTestResult: async () => {} } as never,
      { evictInstance: () => {} } as never,
    );

    const result = await service.test("inst-time" as never);
    expect(result.testedAt).toBe(customTime);
  });

  it("evicts credential session after testing", async () => {
    const evictedIds: string[] = [];
    const appConfig = makeAppConfig();
    const overlayService = new CredentialFieldEnvOverlayService(appConfig as never);
    const registry = new CredentialTypeRegistryImpl(new FakeLoggerFactory());
    registry.register({
      definition: {
        typeId: "test.evict",
        displayName: "Evict",
        publicFields: [],
        secretFields: [],
        supportedSourceKinds: ["db"],
      },
      createSession: async () => ({}),
      test: async () => ({ status: "passing" }),
    } as never);

    const instance = {
      instanceId: "inst-evict",
      typeId: "test.evict",
      publicConfig: {},
      secretRef: { kind: "code", value: {} },
      tags: [],
    };

    const service = new CredentialTestService(
      { requireInstance: async () => instance } as never,
      { compose: async () => ({}) } as never,
      overlayService as never,
      registry,
      { saveTestResult: async () => {} } as never,
      {
        evictInstance: (id: string) => {
          evictedIds.push(id);
        },
      } as never,
    );

    await service.test("inst-evict" as never);
    expect(evictedIds).toContain("inst-evict");
  });
});
