/**
 * Behavioral tests for CodemationBetterAuthRuntime.
 * Tests the lazy auth instantiation and error paths.
 */
import { describe, expect, it } from "vitest";
import { CodemationBetterAuthRuntime } from "../../src/infrastructure/auth/CodemationBetterAuthRuntime";

function makeServerFactory(authInstance: object = { api: { getSession: async () => null } }) {
  return {
    create: (_prisma: unknown) => authInstance,
  };
}

describe("CodemationBetterAuthRuntime", () => {
  it("tryGetAuth returns undefined when prisma is undefined", () => {
    const runtime = new CodemationBetterAuthRuntime({ env: {} } as never, makeServerFactory() as never, undefined);
    expect(runtime.tryGetAuth()).toBeUndefined();
  });

  it("tryGetAuth creates auth instance lazily when prisma is available", () => {
    const prisma = { $queryRaw: async () => [] } as never;
    const runtime = new CodemationBetterAuthRuntime(
      { env: { AUTH_SECRET: "test-secret" } } as never,
      makeServerFactory() as never,
      prisma,
    );
    const auth = runtime.tryGetAuth();
    expect(auth).toBeDefined();
  });

  it("tryGetAuth returns cached instance on second call", () => {
    const prisma = { $queryRaw: async () => [] } as never;
    let createCount = 0;
    const factory = {
      create: (_p: unknown) => {
        createCount++;
        return { api: {} };
      },
    };
    const runtime = new CodemationBetterAuthRuntime(
      { env: { AUTH_SECRET: "secret" } } as never,
      factory as never,
      prisma,
    );
    runtime.tryGetAuth();
    runtime.tryGetAuth();
    expect(createCount).toBe(1); // Only created once
  });

  it("getAuthOrThrow throws 503 when no prisma", () => {
    const runtime = new CodemationBetterAuthRuntime({ env: {} } as never, makeServerFactory() as never, undefined);
    expect(() => runtime.getAuthOrThrow()).toThrow();
    try {
      runtime.getAuthOrThrow();
    } catch (err) {
      expect((err as { status?: number }).status).toBe(503);
    }
  });

  it("getAuthOrThrow returns auth when prisma is available", () => {
    const prisma = { $queryRaw: async () => [] } as never;
    const runtime = new CodemationBetterAuthRuntime(
      { env: { AUTH_SECRET: "test-secret" } } as never,
      makeServerFactory() as never,
      prisma,
    );
    const auth = runtime.getAuthOrThrow();
    expect(auth).toBeDefined();
  });
});
