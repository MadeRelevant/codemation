import { describe, expect, it } from "vitest";
import { CodemationPluginRegistrar } from "../../src/infrastructure/config/CodemationPluginRegistrar";
import { makeAppConfig } from "../testkit/AppConfigFixturesFactory";
import type { CodemationPlugin } from "../../src/presentation/config/CodemationPlugin";

class ContainerStub {
  readonly registrations: Array<{ kind: string; token: unknown; impl?: unknown }> = [];

  registerSingleton(token: unknown, impl: unknown): void {
    this.registrations.push({ kind: "singleton", token, impl });
  }

  registerInstance(token: unknown, value: unknown): void {
    this.registrations.push({ kind: "instance", token, impl: value });
  }

  register(token: unknown, descriptor: unknown): void {
    this.registrations.push({ kind: "factory", token, impl: descriptor });
  }
}

function makeRegistrar(): CodemationPluginRegistrar {
  return new CodemationPluginRegistrar();
}

function makeArgs(plugins: ReadonlyArray<CodemationPlugin>, container = new ContainerStub()) {
  const credentialTypes: unknown[] = [];
  const collections: unknown[] = [];
  const mcpServers: unknown[] = [];

  return {
    plugins,
    container: container as never,
    appConfig: makeAppConfig(),
    registerCredentialType: (type: unknown) => credentialTypes.push(type),
    registerCollection: (def: unknown) => collections.push(def),
    mergeMcpServers: (declarations: ReadonlyArray<unknown>) => mcpServers.push(...declarations),
    loggerFactory: null as never,
    _credentialTypes: credentialTypes,
    _collections: collections,
    _mcpServers: mcpServers,
    _container: container,
  };
}

describe("CodemationPluginRegistrar.apply", () => {
  it("applies no-op on empty plugin list", async () => {
    const registrar = makeRegistrar();
    const args = makeArgs([]);
    await registrar.apply(args);
    expect(args._credentialTypes).toHaveLength(0);
  });

  it("registers credential types from plugins", async () => {
    const registrar = makeRegistrar();
    const plugin: CodemationPlugin = {
      credentialTypes: [{ definition: { typeId: "test.cred" } } as never],
    };
    const args = makeArgs([plugin]);
    await registrar.apply(args);
    expect(args._credentialTypes).toHaveLength(1);
  });

  it("merges MCP servers from plugins", async () => {
    const registrar = makeRegistrar();
    const plugin: CodemationPlugin = {
      mcpServers: [{ id: "mcp-1" } as never],
    };
    const args = makeArgs([plugin]);
    await registrar.apply(args);
    expect(args._mcpServers).toHaveLength(1);
  });

  it("calls plugin.register when provided", async () => {
    const registrar = makeRegistrar();
    let registerCalled = false;
    const plugin: CodemationPlugin = {
      register: async () => {
        registerCalled = true;
      },
    };
    const args = makeArgs([plugin]);
    await registrar.apply(args);
    expect(registerCalled).toBe(true);
  });

  it("skips register call when plugin.register is not provided", async () => {
    const registrar = makeRegistrar();
    const plugin: CodemationPlugin = { credentialTypes: [] };
    const args = makeArgs([plugin]);
    await expect(registrar.apply(args)).resolves.toBeUndefined();
  });

  it("supports registerNode inside plugin.register", async () => {
    const registrar = makeRegistrar();
    const container = new ContainerStub();
    const token = Symbol("test-token");
    const plugin: CodemationPlugin = {
      register: async (ctx) => {
        ctx.registerNode(token as never, class {} as never);
      },
    };
    const args = makeArgs([plugin], container);
    await registrar.apply(args);
    expect(container.registrations.some((r) => r.token === token)).toBe(true);
  });

  it("supports registerValue inside plugin.register", async () => {
    const registrar = makeRegistrar();
    const container = new ContainerStub();
    const token = Symbol("value-token");
    const plugin: CodemationPlugin = {
      register: async (ctx) => {
        ctx.registerValue(token as never, 42 as never);
      },
    };
    const args = makeArgs([plugin], container);
    await registrar.apply(args);
    expect(container.registrations.some((r) => r.token === token && r.impl === 42)).toBe(true);
  });

  it("supports registerFactory inside plugin.register", async () => {
    const registrar = makeRegistrar();
    const container = new ContainerStub();
    const token = Symbol("factory-token");
    const plugin: CodemationPlugin = {
      register: async (ctx) => {
        ctx.registerFactory(token as never, () => "value" as never);
      },
    };
    const args = makeArgs([plugin], container);
    await registrar.apply(args);
    expect(container.registrations.some((r) => r.token === token)).toBe(true);
  });

  it("applies multiple plugins in order", async () => {
    const registrar = makeRegistrar();
    const order: string[] = [];
    const plugins: CodemationPlugin[] = [
      {
        register: async () => {
          order.push("first");
        },
      },
      {
        register: async () => {
          order.push("second");
        },
      },
    ];
    const args = makeArgs(plugins);
    await registrar.apply(args);
    expect(order).toEqual(["first", "second"]);
  });
});
