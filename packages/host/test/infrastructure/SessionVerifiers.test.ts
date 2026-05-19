/**
 * Tests for DevelopmentSessionBypassVerifier and CodemationSessionVerifier.
 */
import { describe, expect, it } from "vitest";
import { DevelopmentSessionBypassVerifier } from "../../src/infrastructure/auth/DevelopmentSessionBypassVerifier";
import { CodemationSessionVerifier } from "../../src/infrastructure/auth/CodemationSessionVerifier";

describe("DevelopmentSessionBypassVerifier", () => {
  it("always returns the development bypass principal", async () => {
    const verifier = new DevelopmentSessionBypassVerifier();
    const result = await verifier.verify();
    expect(result).not.toBeNull();
    expect(result!.id).toBe("codemation-development-bypass");
    expect(result!.email).toBe("development@codemation.local");
  });
});

describe("CodemationSessionVerifier", () => {
  it("delegates verify to BetterAuthApiSessionVerifier", async () => {
    const principal = { id: "user-1", email: "u@example.com", name: "User" };
    const delegate = {
      verify: async (_req: Request) => principal,
    };
    const verifier = new CodemationSessionVerifier(delegate as never);
    const result = await verifier.verify(new Request("http://localhost/"));
    expect(result).toBe(principal);
  });

  it("returns null when delegate returns null", async () => {
    const delegate = { verify: async () => null };
    const verifier = new CodemationSessionVerifier(delegate as never);
    const result = await verifier.verify(new Request("http://localhost/"));
    expect(result).toBeNull();
  });
});
