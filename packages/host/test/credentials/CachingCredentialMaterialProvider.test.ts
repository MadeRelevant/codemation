import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CallerContext,
  CredentialMaterialProvider,
  CredentialMaterialRef,
  MaterialBundle,
} from "@codemation/core";

import { CachingCredentialMaterialProvider } from "../../src/credentials/CachingCredentialMaterialProvider";
import type { Logger, LoggerFactory } from "../../src/application/logging/Logger";

const callerContext: CallerContext = {
  workspaceId: "ws-1",
  caller: { kind: "manual", userId: "u-1" },
};

const localRef: CredentialMaterialRef = { source: "local", id: "inst-1" };

function makeLogger(): LoggerFactory {
  const logger: Logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
  return { create: () => logger };
}

class FakeInnerProvider implements CredentialMaterialProvider {
  getCalls = 0;
  setCalls: Array<{ ref: CredentialMaterialRef; material: MaterialBundle }> = [];
  nextMaterial: MaterialBundle = {
    accessToken: "access-1",
    grantedScopes: ["scope-a"],
  };

  async getMaterial(_ref: CredentialMaterialRef, _ctx: CallerContext): Promise<MaterialBundle> {
    this.getCalls += 1;
    return this.nextMaterial;
  }

  async setMaterial(ref: CredentialMaterialRef, material: MaterialBundle): Promise<void> {
    this.setCalls.push({ ref, material });
  }
}

function makeCache(inner: FakeInnerProvider): CachingCredentialMaterialProvider {
  return new CachingCredentialMaterialProvider(inner, makeLogger());
}

describe("CachingCredentialMaterialProvider", () => {
  const FIXED_NOW = Date.parse("2026-05-26T12:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("cache miss delegates to inner and stores the result", async () => {
    const inner = new FakeInnerProvider();
    inner.nextMaterial = {
      accessToken: "access-1",
      expiresAt: new Date(FIXED_NOW + 30 * 60 * 1000).toISOString(),
      grantedScopes: ["scope-a"],
    };
    const cache = makeCache(inner);

    const result = await cache.getMaterial(localRef, callerContext);

    expect(result).toBe(inner.nextMaterial);
    expect(inner.getCalls).toBe(1);
  });

  it("cache hit returns cached material without delegating", async () => {
    const inner = new FakeInnerProvider();
    inner.nextMaterial = {
      accessToken: "access-1",
      expiresAt: new Date(FIXED_NOW + 30 * 60 * 1000).toISOString(),
      grantedScopes: ["scope-a"],
    };
    const cache = makeCache(inner);

    await cache.getMaterial(localRef, callerContext);
    const second = await cache.getMaterial(localRef, callerContext);

    expect(second).toBe(inner.nextMaterial);
    expect(inner.getCalls).toBe(1);
  });

  it("expired cache entry triggers a re-fetch", async () => {
    const inner = new FakeInnerProvider();
    inner.nextMaterial = {
      accessToken: "access-1",
      expiresAt: new Date(FIXED_NOW + 30 * 60 * 1000).toISOString(),
      grantedScopes: ["scope-a"],
    };
    const cache = makeCache(inner);

    await cache.getMaterial(localRef, callerContext);
    // Advance past hard-cap (5 min).
    vi.setSystemTime(FIXED_NOW + 5 * 60 * 1000 + 1);
    inner.nextMaterial = {
      accessToken: "access-2",
      expiresAt: new Date(FIXED_NOW + 60 * 60 * 1000).toISOString(),
      grantedScopes: ["scope-a"],
    };

    const second = await cache.getMaterial(localRef, callerContext);
    expect(inner.getCalls).toBe(2);
    expect(second.accessToken).toBe("access-2");
  });

  it("setMaterial delegates and invalidates the cache entry", async () => {
    const inner = new FakeInnerProvider();
    inner.nextMaterial = {
      accessToken: "access-1",
      expiresAt: new Date(FIXED_NOW + 30 * 60 * 1000).toISOString(),
      grantedScopes: ["scope-a"],
    };
    const cache = makeCache(inner);

    await cache.getMaterial(localRef, callerContext);
    expect(inner.getCalls).toBe(1);

    const updated: MaterialBundle = {
      accessToken: "access-new",
      grantedScopes: ["scope-a"],
    };
    await cache.setMaterial(localRef, updated);
    expect(inner.setCalls).toHaveLength(1);
    expect(inner.setCalls[0]).toEqual({ ref: localRef, material: updated });

    inner.nextMaterial = {
      accessToken: "access-after-set",
      expiresAt: new Date(FIXED_NOW + 30 * 60 * 1000).toISOString(),
      grantedScopes: ["scope-a"],
    };
    const next = await cache.getMaterial(localRef, callerContext);
    expect(inner.getCalls).toBe(2);
    expect(next.accessToken).toBe("access-after-set");
  });

  it("TTL clamps to expiresAt − 60s when shorter than the 5-minute hard cap", async () => {
    const inner = new FakeInnerProvider();
    // expiresAt 2 minutes from now → safe expiry = now + 60s (well under 5min hard cap)
    inner.nextMaterial = {
      accessToken: "access-1",
      expiresAt: new Date(FIXED_NOW + 2 * 60 * 1000).toISOString(),
      grantedScopes: ["scope-a"],
    };
    const cache = makeCache(inner);

    await cache.getMaterial(localRef, callerContext);
    // Advance 59s — still within (now + 60s) window.
    vi.setSystemTime(FIXED_NOW + 59 * 1000);
    await cache.getMaterial(localRef, callerContext);
    expect(inner.getCalls).toBe(1);
    // Advance past expiresAt − 60s.
    vi.setSystemTime(FIXED_NOW + 61 * 1000);
    await cache.getMaterial(localRef, callerContext);
    expect(inner.getCalls).toBe(2);
  });

  it("TTL clamps to the 5-minute hard cap when expiresAt is far in the future", async () => {
    const inner = new FakeInnerProvider();
    // expiresAt 1 hour from now → safe expiry would be now+59min, but hard cap = now+5min.
    inner.nextMaterial = {
      accessToken: "access-1",
      expiresAt: new Date(FIXED_NOW + 60 * 60 * 1000).toISOString(),
      grantedScopes: ["scope-a"],
    };
    const cache = makeCache(inner);

    await cache.getMaterial(localRef, callerContext);
    // 4 minutes in — still within hard cap.
    vi.setSystemTime(FIXED_NOW + 4 * 60 * 1000);
    await cache.getMaterial(localRef, callerContext);
    expect(inner.getCalls).toBe(1);
    // 5 minutes + 1ms — past hard cap.
    vi.setSystemTime(FIXED_NOW + 5 * 60 * 1000 + 1);
    await cache.getMaterial(localRef, callerContext);
    expect(inner.getCalls).toBe(2);
  });

  it("no expiresAt on material uses the hard cap (5 minutes)", async () => {
    const inner = new FakeInnerProvider();
    inner.nextMaterial = {
      accessToken: "access-1",
      grantedScopes: ["scope-a"],
    };
    const cache = makeCache(inner);

    await cache.getMaterial(localRef, callerContext);
    vi.setSystemTime(FIXED_NOW + 4 * 60 * 1000);
    await cache.getMaterial(localRef, callerContext);
    expect(inner.getCalls).toBe(1);
    vi.setSystemTime(FIXED_NOW + 5 * 60 * 1000 + 1);
    await cache.getMaterial(localRef, callerContext);
    expect(inner.getCalls).toBe(2);
  });

  it("does not cache when computed TTL is ≤ 0 (expiresAt already within 60s)", async () => {
    const inner = new FakeInnerProvider();
    // expiresAt only 30s ahead → safe expiry = now − 30s ≤ now → no caching.
    inner.nextMaterial = {
      accessToken: "access-1",
      expiresAt: new Date(FIXED_NOW + 30 * 1000).toISOString(),
      grantedScopes: ["scope-a"],
    };
    const cache = makeCache(inner);

    await cache.getMaterial(localRef, callerContext);
    await cache.getMaterial(localRef, callerContext);
    expect(inner.getCalls).toBe(2);
  });
});
