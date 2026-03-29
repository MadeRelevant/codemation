import { describe, expect, it } from "vitest";

import { CodemationNextAuthOAuthProviderDescriptorMapper } from "../src/auth/CodemationNextAuthOAuthProviderDescriptorMapper";

describe("CodemationNextAuthOAuthProviderDescriptorMapper", () => {
  it("drops credentials and maps id and name for OAuth providers", () => {
    const mapper = new CodemationNextAuthOAuthProviderDescriptorMapper();
    const result = mapper.mapFromBuiltProviders([
      { id: "credentials", name: "Email and password", type: "credentials" },
      { id: "google", name: "Google", type: "oauth" },
      { id: "custom-oidc", name: "custom-oidc", type: "oidc" },
    ]);
    expect(result).toEqual([
      { id: "google", name: "Google" },
      { id: "custom-oidc", name: "custom-oidc" },
    ]);
  });

  it("uses id as display name when name is missing", () => {
    const mapper = new CodemationNextAuthOAuthProviderDescriptorMapper();
    const result = mapper.mapFromBuiltProviders([{ id: "github" } as { id: string }]);
    expect(result).toEqual([{ id: "github", name: "github" }]);
  });

  it("ignores non-object entries", () => {
    const mapper = new CodemationNextAuthOAuthProviderDescriptorMapper();
    const result = mapper.mapFromBuiltProviders([null, undefined] as never);
    expect(result).toEqual([]);
  });
});
