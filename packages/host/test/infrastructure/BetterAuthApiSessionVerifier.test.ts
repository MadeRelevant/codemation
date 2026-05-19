/**
 * Behavioral tests for BetterAuthApiSessionVerifier.
 * Covers: no auth (tryGetAuth returns undefined), null session data,
 * eligibility check returns false, success path, exception caught.
 */
import { describe, expect, it } from "vitest";
import { BetterAuthApiSessionVerifier } from "../../src/infrastructure/auth/BetterAuthApiSessionVerifier";

function makeRuntime(authInstance: object | undefined) {
  return {
    tryGetAuth: () => authInstance,
  };
}

function makeRequest() {
  return new Request("http://localhost/api/test");
}

describe("BetterAuthApiSessionVerifier.verify", () => {
  it("returns null when tryGetAuth returns undefined (no prisma)", async () => {
    const verifier = new BetterAuthApiSessionVerifier(makeRuntime(undefined) as never, undefined);
    const result = await verifier.verify(makeRequest());
    expect(result).toBeNull();
  });

  it("returns null when getSession returns null", async () => {
    const auth = { api: { getSession: async () => null } };
    const verifier = new BetterAuthApiSessionVerifier(makeRuntime(auth) as never, undefined);
    const result = await verifier.verify(makeRequest());
    expect(result).toBeNull();
  });

  it("returns null when getSession returns data without user", async () => {
    const auth = { api: { getSession: async () => ({ user: null }) } };
    const verifier = new BetterAuthApiSessionVerifier(makeRuntime(auth) as never, undefined);
    const result = await verifier.verify(makeRequest());
    expect(result).toBeNull();
  });

  it("returns null when eligibility check returns false", async () => {
    const auth = {
      api: {
        getSession: async () => ({ user: { id: "user-1", email: "u@example.com", name: "User" } }),
      },
    };
    const eligibility = {
      mayCreateOrResumeBetterAuthSession: async (_id: string) => false,
    };
    const verifier = new BetterAuthApiSessionVerifier(makeRuntime(auth) as never, eligibility as never);
    const result = await verifier.verify(makeRequest());
    expect(result).toBeNull();
  });

  it("returns principal when eligibility check returns true", async () => {
    const auth = {
      api: {
        getSession: async () => ({
          user: { id: "user-2", email: "admin@example.com", name: "Admin" },
        }),
      },
    };
    const eligibility = {
      mayCreateOrResumeBetterAuthSession: async (_id: string) => true,
    };
    const verifier = new BetterAuthApiSessionVerifier(makeRuntime(auth) as never, eligibility as never);
    const result = await verifier.verify(makeRequest());
    expect(result).not.toBeNull();
    expect(result!.id).toBe("user-2");
    expect(result!.email).toBe("admin@example.com");
    expect(result!.name).toBe("Admin");
  });

  it("returns principal when no eligibility checker provided", async () => {
    const auth = {
      api: {
        getSession: async () => ({
          user: { id: "user-3", email: "u3@example.com", name: "Three" },
        }),
      },
    };
    const verifier = new BetterAuthApiSessionVerifier(makeRuntime(auth) as never, undefined);
    const result = await verifier.verify(makeRequest());
    expect(result!.id).toBe("user-3");
  });

  it("returns null when getSession throws", async () => {
    const auth = {
      api: {
        getSession: async () => {
          throw new Error("network error");
        },
      },
    };
    const verifier = new BetterAuthApiSessionVerifier(makeRuntime(auth) as never, undefined);
    const result = await verifier.verify(makeRequest());
    expect(result).toBeNull();
  });

  it("handles non-string email and name (returns null for them)", async () => {
    const auth = {
      api: {
        getSession: async () => ({
          user: { id: "user-4", email: 42, name: null },
        }),
      },
    };
    const verifier = new BetterAuthApiSessionVerifier(makeRuntime(auth) as never, undefined);
    const result = await verifier.verify(makeRequest());
    expect(result!.id).toBe("user-4");
    expect(result!.email).toBeNull();
    expect(result!.name).toBeNull();
  });
});
