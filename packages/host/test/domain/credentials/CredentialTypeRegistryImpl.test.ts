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
  describe("register / listTypes / getType", () => {
    it("registers a type and returns it from listTypes", () => {
      const registry = new CredentialTypeRegistryImpl(makeLoggerFactory());
      const { type } = makeCredentialType("test.type");
      registry.register(type);
      const types = registry.listTypes();
      expect(types).toHaveLength(1);
      expect(types[0]!.typeId).toBe("test.type");
    });

    it("throws when the same typeId is registered twice", () => {
      const registry = new CredentialTypeRegistryImpl(makeLoggerFactory());
      const { type } = makeCredentialType("dup.type");
      registry.register(type);
      expect(() => registry.register(type)).toThrow("Credential type already registered: dup.type");
    });
  });

  describe("applyControlPlaneOverrides", () => {
    it("replaces the definition of an existing type", () => {
      const registry = new CredentialTypeRegistryImpl(makeLoggerFactory());
      const { type } = makeCredentialType("myapp.key", "Original Name");
      registry.register(type);

      const override: CredentialTypeDefinition = {
        typeId: "myapp.key",
        displayName: "Overridden Name",
        description: "From control plane",
      };
      registry.applyControlPlaneOverrides([override]);

      const types = registry.listTypes();
      expect(types).toHaveLength(1);
      expect(types[0]!.displayName).toBe("Overridden Name");
      expect(types[0]!.description).toBe("From control plane");
    });

    it("does not replace createSession or test callbacks", () => {
      const registry = new CredentialTypeRegistryImpl(makeLoggerFactory());
      const { type, createSession, test } = makeCredentialType("myapp.key");
      registry.register(type);

      const override: CredentialTypeDefinition = { typeId: "myapp.key", displayName: "New Name" };
      registry.applyControlPlaneOverrides([override]);

      const resolved = registry.getCredentialType("myapp.key");
      expect(resolved?.createSession).toBe(createSession);
      expect(resolved?.test).toBe(test);
    });

    it("getCredentialType returns a type whose definition reflects the override", () => {
      const registry = new CredentialTypeRegistryImpl(makeLoggerFactory());
      const { type } = makeCredentialType("myapp.key", "Before");
      registry.register(type);

      const override: CredentialTypeDefinition = { typeId: "myapp.key", displayName: "After" };
      registry.applyControlPlaneOverrides([override]);

      const resolved = registry.getCredentialType("myapp.key");
      expect(resolved?.definition.displayName).toBe("After");
    });

    it("logs a warning and skips unknown typeIds — does not throw", () => {
      const warn = vi.fn();
      const registry = new CredentialTypeRegistryImpl(makeLoggerFactory(warn));

      const override: CredentialTypeDefinition = { typeId: "unknown.type", displayName: "X" };
      expect(() => registry.applyControlPlaneOverrides([override])).not.toThrow();
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0]![0]).toContain("unknown.type");
    });

    it("is idempotent — calling twice with the same payload yields the same state", () => {
      const registry = new CredentialTypeRegistryImpl(makeLoggerFactory());
      const { type } = makeCredentialType("myapp.key", "Original");
      registry.register(type);

      const override: CredentialTypeDefinition = { typeId: "myapp.key", displayName: "Stable" };
      registry.applyControlPlaneOverrides([override]);
      registry.applyControlPlaneOverrides([override]);

      const types = registry.listTypes();
      expect(types).toHaveLength(1);
      expect(types[0]!.displayName).toBe("Stable");
    });

    it("does not affect types not present in the overrides array", () => {
      const registry = new CredentialTypeRegistryImpl(makeLoggerFactory());
      const { type: typeA } = makeCredentialType("app.a", "A Original");
      const { type: typeB } = makeCredentialType("app.b", "B Original");
      registry.register(typeA);
      registry.register(typeB);

      const override: CredentialTypeDefinition = { typeId: "app.a", displayName: "A Overridden" };
      registry.applyControlPlaneOverrides([override]);

      const types = registry.listTypes();
      const b = types.find((t) => t.typeId === "app.b");
      expect(b?.displayName).toBe("B Original");
    });
  });
});
