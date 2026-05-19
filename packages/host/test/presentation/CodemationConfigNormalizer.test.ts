import { describe, expect, it } from "vitest";
import { CodemationConfigNormalizer } from "../../src/presentation/config/CodemationConfigNormalizer";
import type { CodemationConfig } from "../../src/presentation/config/CodemationConfig";

function makeMinimalConfig(overrides: Partial<CodemationConfig> = {}): CodemationConfig {
  return {
    ...overrides,
  } as CodemationConfig;
}

const normalizer = new CodemationConfigNormalizer();

describe("CodemationConfigNormalizer.normalize", () => {
  it("normalizes basic config without register callback", () => {
    const config = makeMinimalConfig({ workflows: [] });
    const result = normalizer.normalize(config);
    expect(result.containerRegistrations).toHaveLength(0);
    expect(result.credentialTypes).toHaveLength(0);
    expect(result.collections).toHaveLength(0);
  });

  it("collects credential types from register callback", () => {
    const credType = { definition: { typeId: "test.cred" } } as never;
    const config = makeMinimalConfig({
      register: (ctx) => {
        ctx.registerCredentialType(credType);
      },
    });
    const result = normalizer.normalize(config);
    expect(result.credentialTypes).toContain(credType);
  });

  it("collects collections from register callback", () => {
    const collection = { name: "users", fields: {} } as never;
    const config = makeMinimalConfig({
      register: (ctx) => {
        ctx.registerCollection(collection);
      },
    });
    const result = normalizer.normalize(config);
    expect(result.collections).toContain(collection);
  });

  it("collects workflow from registerWorkflow in register callback", () => {
    const workflow = { id: "wf-1", nodes: [], connections: [] } as never;
    const config = makeMinimalConfig({
      register: (ctx) => {
        ctx.registerWorkflow(workflow);
      },
    });
    const result = normalizer.normalize(config);
    expect(result.workflows).toContain(workflow);
  });

  it("collects workflows from registerWorkflows in register callback", () => {
    const workflows = [{ id: "wf-1" }, { id: "wf-2" }] as never[];
    const config = makeMinimalConfig({
      register: (ctx) => {
        ctx.registerWorkflows(workflows);
      },
    });
    const result = normalizer.normalize(config);
    expect(result.workflows).toHaveLength(2);
  });

  it("collects workflow directories from discoverWorkflows in register callback", () => {
    const config = makeMinimalConfig({
      register: (ctx) => {
        ctx.discoverWorkflows("/src/workflows", "/src/more");
      },
    });
    const result = normalizer.normalize(config);
    expect(result.workflowDiscovery?.directories).toContain("/src/workflows");
    expect(result.workflowDiscovery?.directories).toContain("/src/more");
  });

  it("merges config.workflowDiscovery.directories with register directories", () => {
    const config = makeMinimalConfig({
      workflowDiscovery: { directories: ["/existing"] },
      register: (ctx) => {
        ctx.discoverWorkflows("/new");
      },
    });
    const result = normalizer.normalize(config);
    expect(result.workflowDiscovery?.directories).toContain("/existing");
    expect(result.workflowDiscovery?.directories).toContain("/new");
  });

  it("returns undefined workflows when both are empty", () => {
    const config = makeMinimalConfig({ workflows: [] });
    const result = normalizer.normalize(config);
    expect(result.workflows).toBeUndefined();
  });

  it("deduplicate workflows by id (configured overrides registered)", () => {
    const configuredWf = { id: "wf-1", name: "configured" } as never;
    const registeredWf = { id: "wf-1", name: "registered" } as never;
    const config = makeMinimalConfig({
      workflows: [configuredWf],
      register: (ctx) => {
        ctx.registerWorkflow(registeredWf);
      },
    });
    const result = normalizer.normalize(config);
    const wf1 = result.workflows?.find((w: { id: string }) => w.id === "wf-1");
    expect(wf1).toBeDefined();
    // configured overrides registered
    expect((wf1 as { name: string }).name).toBe("configured");
  });

  it("registers node via registerNode in register callback", () => {
    const token = Symbol("test");
    const config = makeMinimalConfig({
      register: (ctx) => {
        ctx.registerNode(token as never, class {} as never);
      },
    });
    const result = normalizer.normalize(config);
    expect(result.containerRegistrations.some((r) => r.token === token)).toBe(true);
  });

  it("registers value via registerValue in register callback", () => {
    const token = Symbol("val-token");
    const config = makeMinimalConfig({
      register: (ctx) => {
        ctx.registerValue(token as never, 42 as never);
      },
    });
    const result = normalizer.normalize(config);
    const reg = result.containerRegistrations.find((r) => r.token === token);
    expect(reg).toBeDefined();
    expect((reg as { useValue: unknown }).useValue).toBe(42);
  });

  it("registers class via registerClass in register callback", () => {
    const token = Symbol("class-token");
    class MyClass {}
    const config = makeMinimalConfig({
      register: (ctx) => {
        ctx.registerClass(token as never, MyClass as never);
      },
    });
    const result = normalizer.normalize(config);
    const reg = result.containerRegistrations.find((r) => r.token === token);
    expect(reg).toBeDefined();
  });

  it("registers factory via registerFactory in register callback", () => {
    const token = Symbol("factory-token");
    const config = makeMinimalConfig({
      register: (ctx) => {
        ctx.registerFactory(token as never, () => "value" as never);
      },
    });
    const result = normalizer.normalize(config);
    const reg = result.containerRegistrations.find((r) => r.token === token);
    expect(reg).toBeDefined();
  });

  it("normalizeRuntimeConfig returns config.runtime when no app", () => {
    const config = makeMinimalConfig({ runtime: { frontendPort: 3001 } as never });
    const result = normalizer.normalize(config);
    expect(result.runtime?.frontendPort).toBe(3001);
  });

  it("normalizeDatabaseConfig uses app.databaseUrl when set", () => {
    const config = makeMinimalConfig({
      app: {
        frontendPort: 3000,
        scheduler: { kind: "inline" },
        databaseUrl: "postgres://localhost/db",
        auth: undefined as never,
      } as never,
    });
    const result = normalizer.normalize(config);
    expect(result.runtime?.database?.url).toBe("postgres://localhost/db");
  });

  it("normalizeSchedulerConfig maps queue kind to bullmq", () => {
    const config = makeMinimalConfig({
      app: {
        scheduler: { kind: "queue", redisUrl: "redis://localhost" },
        auth: undefined as never,
      } as never,
    });
    const result = normalizer.normalize(config);
    expect(result.runtime?.scheduler?.kind).toBe("bullmq");
  });

  it("normalizeSchedulerConfig maps inline kind to local", () => {
    const config = makeMinimalConfig({
      app: {
        scheduler: { kind: "inline" },
        auth: undefined as never,
      } as never,
    });
    const result = normalizer.normalize(config);
    expect(result.runtime?.scheduler?.kind).toBe("local");
    expect(result.runtime?.eventBus?.kind).toBe("memory");
  });
});

describe("CodemationConfigNormalizer.normalize - managed auth constraints", () => {
  it("throws when managed auth is combined with oauth providers", () => {
    const config = makeMinimalConfig({
      auth: { kind: "managed", oauth: [{ id: "github" }] } as never,
      workflows: [{ id: "wf-1" } as never],
    });
    expect(() => normalizer.normalize(config)).toThrow('"managed" cannot be combined with oauth');
  });

  it("throws when managed auth is combined with oidc providers", () => {
    const config = makeMinimalConfig({
      auth: { kind: "managed", oidc: [{ id: "oidc-1" }] } as never,
      workflows: [{ id: "wf-1" } as never],
    });
    expect(() => normalizer.normalize(config)).toThrow('"managed" cannot be combined with oidc');
  });

  it("throws when managed auth is combined with allowUnauthenticatedInDevelopment", () => {
    const config = makeMinimalConfig({
      auth: { kind: "managed", allowUnauthenticatedInDevelopment: true } as never,
      workflows: [{ id: "wf-1" } as never],
    });
    expect(() => normalizer.normalize(config)).toThrow("allowUnauthenticatedInDevelopment");
  });

  it("throws when managed auth has no workflow sources", () => {
    const config = makeMinimalConfig({
      auth: { kind: "managed" } as never,
      workflows: [],
    });
    expect(() => normalizer.normalize(config)).toThrow("require at least one workflow source");
  });

  it("does not throw for managed auth with valid workflows", () => {
    const config = makeMinimalConfig({
      auth: { kind: "managed" } as never,
      workflows: [{ id: "wf-1" } as never],
    });
    expect(() => normalizer.normalize(config)).not.toThrow();
  });
});

describe("CodemationConfigNormalizer - DefinedCollection unwrapping", () => {
  it("unwraps DefinedCollection objects (those with kind: 'defined-collection')", () => {
    const def = { name: "users", fields: {} };
    const definedCollection = { kind: "defined-collection", definition: def } as never;
    const config = makeMinimalConfig({ collections: [definedCollection] });
    const result = normalizer.normalize(config);
    expect(result.collections[0]).toEqual(def);
  });

  it("passes through plain CollectionDefinition unchanged", () => {
    const def = { name: "posts", fields: {} } as never;
    const config = makeMinimalConfig({ collections: [def] });
    const result = normalizer.normalize(config);
    expect(result.collections[0]).toBe(def);
  });
});
