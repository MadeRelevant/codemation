import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { describe, it, expect, beforeAll } from "vitest";
import { JwksCache } from "../src/JwksCache.js";
import { ManagedJwtVerifier } from "../src/ManagedJwtVerifier.js";
import type { Clock, FetchFn } from "../src/types.js";

const ISSUER = "https://cp.example.com";
const WORKSPACE_ID = "ws-abc123";

interface JwkPublicKey {
  kid: string;
  kty: string;
  crv?: string;
  x?: string;
  use?: string;
  alg?: string;
}

interface TestKeyPair {
  privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
  publicKey: Awaited<ReturnType<typeof generateKeyPair>>["publicKey"];
  jwk: JwkPublicKey;
}

async function generateEd25519Pair(kid: string): Promise<TestKeyPair> {
  const { privateKey, publicKey } = await generateKeyPair("EdDSA");
  const pub = await exportJWK(publicKey);
  return {
    privateKey,
    publicKey,
    jwk: { kid, kty: pub.kty!, crv: pub.crv, x: pub.x, use: "sig", alg: "EdDSA" },
  };
}

function makeStaticFetch(keys: JwkPublicKey[]): FetchFn {
  return async () => ({
    ok: true,
    json: async () => ({ keys }),
  });
}

function makeFrozenClock(): Clock {
  return { now: () => 0 };
}

// Deterministic timestamps: use fixed calendar dates rather than Date.now().
// exp far in the future (2099) — always valid by the real clock.
// Expired exp: a date in the past (2000).
// Future nbf: a date in the distant future (2099).
const EXP_FUTURE_UNIX = Math.floor(new Date("2099-12-31T00:00:00Z").getTime() / 1000);
const EXP_PAST_UNIX = Math.floor(new Date("2000-01-01T00:00:00Z").getTime() / 1000);
const NBF_PAST_UNIX = Math.floor(new Date("2000-01-01T00:00:00Z").getTime() / 1000);
const NBF_FUTURE_UNIX = Math.floor(new Date("2099-12-31T00:00:00Z").getTime() / 1000);

async function makeToken(
  privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"],
  kid: string,
  overrides: Partial<{
    iss: string;
    aud: string;
    sub: string;
    expired: boolean;
    notYetValid: boolean;
  }> = {},
): Promise<string> {
  const exp = overrides.expired === true ? EXP_PAST_UNIX : EXP_FUTURE_UNIX;
  const nbf = overrides.notYetValid === true ? NBF_FUTURE_UNIX : NBF_PAST_UNIX;

  return new SignJWT({ sub: overrides.sub ?? "user-42" })
    .setProtectedHeader({ alg: "EdDSA", kid })
    .setIssuer(overrides.iss ?? ISSUER)
    .setAudience(overrides.aud ?? WORKSPACE_ID)
    .setExpirationTime(exp)
    .setNotBefore(nbf)
    .sign(privateKey);
}

function makeVerifier(keys: JwkPublicKey[]): ManagedJwtVerifier {
  const cache = new JwksCache(
    { jwksUrl: "/jwks", ttlMs: 60_000, jitterMs: 0 },
    makeStaticFetch(keys),
    makeFrozenClock(),
  );
  return new ManagedJwtVerifier(
    { expectedIssuer: ISSUER, expectedAudience: WORKSPACE_ID, jwksCache: { jwksUrl: "/jwks" } },
    cache,
  );
}

describe("ManagedJwtVerifier", () => {
  let kp1: TestKeyPair;
  let kp2: TestKeyPair;

  beforeAll(async () => {
    kp1 = await generateEd25519Pair("key-1");
    kp2 = await generateEd25519Pair("key-2");
  });

  it("returns VerifiedManagedPrincipal for a valid token", async () => {
    const verifier = makeVerifier([kp1.jwk]);
    const token = await makeToken(kp1.privateKey, "key-1");
    const result = await verifier.verify(token);
    expect("failure" in result).toBe(false);
    if (!("failure" in result)) {
      expect(result.userId).toBe("user-42");
      expect(result.workspaceId).toBe(WORKSPACE_ID);
    }
  });

  it("fails with bad-signature for a tampered token", async () => {
    const verifier = makeVerifier([kp1.jwk]);
    const token = await makeToken(kp1.privateKey, "key-1");
    const parts = token.split(".");
    // Tamper the payload
    const tampered = `${parts[0]}.${parts[1]}X.${parts[2]}`;
    const result = await verifier.verify(tampered);
    expect("failure" in result).toBe(true);
    if ("failure" in result) {
      expect(["bad-signature", "malformed"]).toContain(result.failure);
    }
  });

  it("fails with wrong-aud for a token targeting a different workspace", async () => {
    const verifier = makeVerifier([kp1.jwk]);
    const token = await makeToken(kp1.privateKey, "key-1", { aud: "ws-other" });
    const result = await verifier.verify(token);
    expect("failure" in result).toBe(true);
    if ("failure" in result) {
      expect(result.failure).toBe("wrong-aud");
    }
  });

  it("fails with wrong-iss for a token from a different issuer", async () => {
    const verifier = makeVerifier([kp1.jwk]);
    const token = await makeToken(kp1.privateKey, "key-1", { iss: "https://evil.example.com" });
    const result = await verifier.verify(token);
    expect("failure" in result).toBe(true);
    if ("failure" in result) {
      expect(result.failure).toBe("wrong-iss");
    }
  });

  it("fails with expired for an expired token", async () => {
    const verifier = makeVerifier([kp1.jwk]);
    const token = await makeToken(kp1.privateKey, "key-1", { expired: true });
    const result = await verifier.verify(token);
    expect("failure" in result).toBe(true);
    if ("failure" in result) {
      expect(result.failure).toBe("expired");
    }
  });

  it("fails with not-yet-valid for a future token", async () => {
    const verifier = makeVerifier([kp1.jwk]);
    const token = await makeToken(kp1.privateKey, "key-1", { notYetValid: true });
    const result = await verifier.verify(token);
    expect("failure" in result).toBe(true);
    if ("failure" in result) {
      expect(result.failure).toBe("not-yet-valid");
    }
  });

  it("fails with missing-kid when header has no kid field", async () => {
    const verifier = makeVerifier([kp1.jwk]);
    // Build a token without kid in header using deterministic timestamps
    const token = await new SignJWT({ sub: "user-1" })
      .setProtectedHeader({ alg: "EdDSA" }) // no kid
      .setIssuer(ISSUER)
      .setAudience(WORKSPACE_ID)
      .setExpirationTime(EXP_FUTURE_UNIX)
      .setNotBefore(NBF_PAST_UNIX)
      .sign(kp1.privateKey);
    const result = await verifier.verify(token);
    expect("failure" in result).toBe(true);
    if ("failure" in result) {
      expect(result.failure).toBe("missing-kid");
    }
  });

  it("fails with unknown-kid after refresh when kid is not in JWKS", async () => {
    const verifier = makeVerifier([kp1.jwk]);
    // Token signed with key-2 but JWKS only has key-1 (even after refresh)
    const token = await makeToken(kp2.privateKey, "key-2");
    const result = await verifier.verify(token);
    expect("failure" in result).toBe(true);
    if ("failure" in result) {
      expect(result.failure).toBe("unknown-kid");
    }
  });

  it("accepts a new-key token after CP rotates keys (kid appears on refresh)", async () => {
    // First JWKS response has only key-1; second response (on kid miss) adds key-2
    let callCount = 0;
    const fetch: FetchFn = async () => {
      callCount++;
      const keys = callCount === 1 ? [kp1.jwk] : [kp1.jwk, kp2.jwk];
      return { ok: true, json: async () => ({ keys }) };
    };
    const cache = new JwksCache({ jwksUrl: "/jwks", ttlMs: 60_000, jitterMs: 0 }, fetch, { now: () => 0 });
    const verifier = new ManagedJwtVerifier(
      { expectedIssuer: ISSUER, expectedAudience: WORKSPACE_ID, jwksCache: { jwksUrl: "/jwks" } },
      cache,
    );

    // Warm the cache with key-1 only
    await cache.getKey("key-1");

    // Now verify a token using key-2 — should trigger refresh and succeed
    const token = await makeToken(kp2.privateKey, "key-2");
    const result = await verifier.verify(token);
    expect("failure" in result).toBe(false);
    if (!("failure" in result)) {
      expect(result.userId).toBe("user-42");
    }
  });

  it("fails with malformed for a completely invalid token string", async () => {
    const verifier = makeVerifier([kp1.jwk]);
    const result = await verifier.verify("not.a.jwt");
    expect("failure" in result).toBe(true);
    if ("failure" in result) {
      expect(["malformed", "missing-kid", "unknown-kid", "bad-signature"]).toContain(result.failure);
    }
  });
});
