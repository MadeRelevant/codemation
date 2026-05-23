import { describe, expect, it, vi } from "vitest";
import type { CredentialTypeDefinition } from "@codemation/core";
import type { LoggerFactory } from "../../../src/application/logging/Logger";
import type { AnyCredentialType } from "../../../src/domain/credentials/CredentialServices";
import { CredentialTypeRegistryImpl } from "../../../src/domain/credentials/CredentialTypeRegistryImpl";

function makeLoggerFactory(warn = vi.fn()): LoggerFactory {
  return {
    create: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn,
      error: vi.fn(),
    }),
  } as unknown as LoggerFactory;
}

function makeCredentialType(
  typeId: string,
  displayName = typeId,
): { type: AnyCredentialType; createSession: AnyCredentialType["createSession"]; test: AnyCredentialType["test"] } {
  const createSession = vi.fn(async () => ({}));
  const test = vi.fn(async () => ({ status: "healthy" as const }));
  const type: AnyCredentialType = {
    definition: { typeId, displayName } as CredentialTypeDefinition,
    createSession,
    test,
  };
  return { type, createSession, test };
}

describe("CredentialTypeRegistryImpl", () => {
  describe("merge", () => {
    it("merge('plugin', [type]) registers a single type and listTypes returns it", () => {
      const registry = new CredentialTypeRegistryImpl(makeLoggerFactory());
      const { type } = makeCredentialType("test.type");
      registry.merge("plugin", [type]);
      const types = registry.listTypes();
      expect(types).toHaveLength(1);
      expect(types[0]!.typeId).toBe("test.type");
    });

    it("same-source re-merge is idempotent and does not log a warning", () => {
      const warn = vi.fn();
      const registry = new CredentialTypeRegistryImpl(makeLoggerFactory(warn));
      const { type } = makeCredentialType("test.type", "Original");
      registry.merge("plugin", [type]);
      registry.merge("plugin", [type]);
      expect(registry.listTypes()).toHaveLength(1);
      expect(warn).not.toHaveBeenCalled();
    });

    it("higher-priority source shadows existing entry and logs warn", () => {
      const warn = vi.fn();
      const registry = new CredentialTypeRegistryImpl(makeLoggerFactory(warn));
      const { type } = makeCredentialType("app.key", "Plugin Name");
      registry.merge("plugin", [type]);

      const configType = makeCredentialType("app.key", "Config Name").type;
      registry.merge("config", [configType]);

      const resolved = registry.getCredentialType("app.key");
      expect(resolved?.definition.displayName).toBe("Config Name");
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0]![0]).toMatch(/shadowed/);
    });

    it("lower-priority source is ignored when a higher-priority entry exists and logs warn", () => {
      const warn = vi.fn();
      const registry = new CredentialTypeRegistryImpl(makeLoggerFactory(warn));
      const configType = makeCredentialType("app.key", "Config Name").type;
      registry.merge("config", [configType]);

      const pluginType = makeCredentialType("app.key", "Plugin Name").type;
      registry.merge("plugin", [pluginType]);

      const resolved = registry.getCredentialType("app.key");
      expect(resolved?.definition.displayName).toBe("Config Name");
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0]![0]).toMatch(/lower-priority/);
    });
  });

  describe("mergeDefinitions", () => {
    it("adds a new control-plane definition with stub createSession/test", async () => {
      const registry = new CredentialTypeRegistryImpl(makeLoggerFactory());
      const definition: CredentialTypeDefinition = { typeId: "oauth.google.gmail", displayName: "Gmail" };
      registry.mergeDefinitions("controlPlane", [definition]);

      const types = registry.listTypes();
      expect(types).toHaveLength(1);
      expect(types[0]!.typeId).toBe("oauth.google.gmail");

      const entry = registry.getCredentialType("oauth.google.gmail")!;
      await expect(
        entry.createSession({ instance: {} as never, material: {} as never, publicConfig: {} as never }),
      ).rejects.toThrow(/no createSession/);
      const health = await entry.test({ instance: {} as never, material: {} as never, publicConfig: {} as never });
      expect(health.status).toBe("unknown");
    });

    it("mergeDefinitions('controlPlane', [def]) shadows an existing 'plugin' entry — warn logged", () => {
      const warn = vi.fn();
      const registry = new CredentialTypeRegistryImpl(makeLoggerFactory(warn));
      const { type } = makeCredentialType("app.key", "Plugin Name");
      registry.merge("plugin", [type]);

      registry.mergeDefinitions("controlPlane", [{ typeId: "app.key", displayName: "Control Plane Name" }]);

      const resolved = registry.getCredentialType("app.key");
      expect(resolved?.definition.displayName).toBe("Control Plane Name");
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0]![0]).toMatch(/shadowed/);
    });

    it("merge('plugin', [type]) is ignored when a 'controlPlane' entry already exists — warn logged", () => {
      const warn = vi.fn();
      const registry = new CredentialTypeRegistryImpl(makeLoggerFactory(warn));
      registry.mergeDefinitions("controlPlane", [{ typeId: "app.key", displayName: "Control Plane Name" }]);
      warn.mockClear();

      const { type } = makeCredentialType("app.key", "Plugin Name");
      registry.merge("plugin", [type]);

      const resolved = registry.getCredentialType("app.key");
      expect(resolved?.definition.displayName).toBe("Control Plane Name");
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0]![0]).toMatch(/lower-priority/);
    });

    it("same-source mergeDefinitions replaces the definition and preserves prior createSession/test", async () => {
      const registry = new CredentialTypeRegistryImpl(makeLoggerFactory());
      registry.mergeDefinitions("controlPlane", [{ typeId: "app.key", displayName: "v1" }]);
      const firstEntry = registry.getCredentialType("app.key")!;

      registry.mergeDefinitions("controlPlane", [{ typeId: "app.key", displayName: "v2" }]);
      const secondEntry = registry.getCredentialType("app.key")!;
      expect(secondEntry.definition.displayName).toBe("v2");
      expect(secondEntry.createSession).toBe(firstEntry.createSession);
    });
  });

  describe("clear", () => {
    it("clear('controlPlane') removes only control-plane entries; plugin entries remain", () => {
      const registry = new CredentialTypeRegistryImpl(makeLoggerFactory());
      const { type } = makeCredentialType("plugin.type");
      registry.merge("plugin", [type]);
      registry.mergeDefinitions("controlPlane", [{ typeId: "cp.type", displayName: "CP" }]);

      registry.clear("controlPlane");

      const ids = registry.listTypes().map((t) => t.typeId);
      expect(ids).toEqual(["plugin.type"]);
    });

    it("clear('controlPlane') is a no-op when no control-plane entries have been merged", () => {
      const registry = new CredentialTypeRegistryImpl(makeLoggerFactory());
      const { type } = makeCredentialType("plugin.type");
      registry.merge("plugin", [type]);

      expect(() => registry.clear("controlPlane")).not.toThrow();
      expect(registry.listTypes()).toHaveLength(1);
    });
  });

  describe("getType / getCredentialType", () => {
    it("returns undefined for unknown typeId", () => {
      const registry = new CredentialTypeRegistryImpl(makeLoggerFactory());
      expect(registry.getType("missing")).toBeUndefined();
      expect(registry.getCredentialType("missing")).toBeUndefined();
    });
  });
});
