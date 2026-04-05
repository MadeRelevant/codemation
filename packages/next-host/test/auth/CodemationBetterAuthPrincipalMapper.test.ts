import { describe, expect, it } from "vitest";

import { CodemationBetterAuthPrincipalMapper } from "../../src/auth/CodemationBetterAuthPrincipalMapper";

describe("CodemationBetterAuthPrincipalMapper", () => {
  it("maps a Better Auth get-session user payload into CodemationSession", () => {
    const mapper = new CodemationBetterAuthPrincipalMapper();
    const session = mapper.fromGetSessionPayload({
      session: { id: "sess-1" },
      user: { id: "user-1", email: "a@b.com", name: "Alice" },
    });
    expect(session).toEqual({
      id: "user-1",
      email: "a@b.com",
      name: "Alice",
    });
  });

  it("returns null when the payload is not a user-backed session", () => {
    const mapper = new CodemationBetterAuthPrincipalMapper();
    expect(mapper.fromGetSessionPayload(null)).toBeNull();
    expect(mapper.fromGetSessionPayload({})).toBeNull();
    expect(mapper.fromGetSessionPayload({ session: {}, user: null })).toBeNull();
  });
});
