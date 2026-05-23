import { generateKeyPair, exportJWK } from "jose";
import { describe, it, expect, beforeAll } from "vitest";
import { JwksCache } from "../src/JwksCache.js";
import type { Clock, FetchFn } from "../src/types.js";

interface FakeJwkKey {
  kid: string;
  kty: string;
  crv?: string;
  x?: string;
  d?: string;
  use?: string;
  alg?: string;
}

function makeClock(nowMs = 0): Clock {
  let current = nowMs;
  return {
    now: () => current,
    advance(ms: number) {
      current += ms;
    },
  } as Clock & { advance(ms: number): void };
}

describe("JwksCache", () => {
  let edKey1: FakeJwkKey;
  let edKey2: FakeJwkKey;

  beforeAll(async () => {
    const kp1 = await generateKeyPair("EdDSA");
    const pub1 = await exportJWK(kp1.publicKey);
    edKey1 = { kid: "key-1", kty: pub1.kty!, crv: pub1.crv, x: pub1.x, use: "sig", alg: "EdDSA" };

    const kp2 = await generateKeyPair("EdDSA");
    const pub2 = await exportJWK(kp2.publicKey);
    edKey2 = { kid: "key-2", kty: pub2.kty!, crv: pub2.crv, x: pub2.x, use: "sig", alg: "EdDSA" };
  });

  it("fetches keys on cold start and returns the key for a known kid", async () => {
    const responses = new Map([["/jwks", [edKey1]]]);
    let callCount = 0;
    const fetch: FetchFn = async (url) => {
      callCount++;
      return { ok: true, json: async () => ({ keys: responses.get(url) ?? [] }) };
    };
    const cache = new JwksCache({ jwksUrl: "/jwks", ttlMs: 60_000, jitterMs: 0 }, fetch, makeClock());

    const key = await cache.getKey("key-1");
    expect(key).not.toBeNull();
    expect(callCount).toBe(1);
  });

  it("returns the cached key on a subsequent hit without re-fetching", async () => {
    let callCount = 0;
    const fetch: FetchFn = async () => {
      callCount++;
      return { ok: true, json: async () => ({ keys: [edKey1] }) };
    };
    const clock = makeClock(0) as ReturnType<typeof makeClock> & { advance(ms: number): void };
    (clock as unknown as { advance(ms: number): void }).advance = (ms: number) => {
      (clock as unknown as { _now: number })._now = ((clock as unknown as { _now: number })._now ?? 0) + ms;
    };

    // Use a simple advancing clock
    let now = 0;
    const advancingClock: Clock = { now: () => now };

    const cache = new JwksCache({ jwksUrl: "/jwks", ttlMs: 60_000, jitterMs: 0 }, fetch, advancingClock);

    await cache.getKey("key-1");
    now += 30_000; // advance 30s — still within TTL
    await cache.getKey("key-1");

    expect(callCount).toBe(1); // no second fetch
  });

  it("re-fetches after TTL expires", async () => {
    let callCount = 0;
    const fetch: FetchFn = async () => {
      callCount++;
      return { ok: true, json: async () => ({ keys: [edKey1] }) };
    };

    let now = 0;
    const clock: Clock = { now: () => now };

    const cache = new JwksCache({ jwksUrl: "/jwks", ttlMs: 60_000, jitterMs: 0 }, fetch, clock);

    await cache.getKey("key-1");
    now += 61_000; // past TTL
    await cache.getKey("key-1");

    expect(callCount).toBe(2);
  });

  it("refreshes once on kid miss and returns the new key", async () => {
    let callCount = 0;
    // First fetch has only key-1; second has key-1 and key-2
    const fetch: FetchFn = async () => {
      callCount++;
      const keys = callCount === 1 ? [edKey1] : [edKey1, edKey2];
      return { ok: true, json: async () => ({ keys }) };
    };
    const clock: Clock = { now: () => 0 };
    const cache = new JwksCache({ jwksUrl: "/jwks", ttlMs: 60_000, jitterMs: 0 }, fetch, clock);

    // Populate cache with just key-1
    await cache.getKey("key-1");
    expect(callCount).toBe(1);

    // Ask for key-2 — cache miss triggers one refresh
    const key = await cache.getKey("key-2");
    expect(key).not.toBeNull();
    expect(callCount).toBe(2);
  });

  it("returns null after refresh when kid is still unknown", async () => {
    const fetch: FetchFn = async () => ({
      ok: true,
      json: async () => ({ keys: [edKey1] }),
    });
    const clock: Clock = { now: () => 0 };
    const cache = new JwksCache({ jwksUrl: "/jwks", ttlMs: 60_000, jitterMs: 0 }, fetch, clock);

    const key = await cache.getKey("unknown-kid");
    expect(key).toBeNull();
  });

  it("propagates fetch errors", async () => {
    const fetch: FetchFn = async () => ({ ok: false, json: async () => ({}) });
    const clock: Clock = { now: () => 0 };
    const cache = new JwksCache({ jwksUrl: "/jwks" }, fetch, clock);

    await expect(cache.getKey("any")).rejects.toThrow("JWKS fetch failed");
  });
});
