import { describe,expect,it } from "vitest";
import { labelForLinkedAuthAccount } from "../src/domain/users/userLoginMethodLabels.types";

describe("labelForLinkedAuthAccount", () => {
  it("maps known OAuth providers", () => {
    expect(labelForLinkedAuthAccount("google", "oauth")).toBe("Google");
    expect(labelForLinkedAuthAccount("github", "oauth")).toBe("GitHub");
    expect(labelForLinkedAuthAccount("microsoft-entra-id", "oidc")).toBe("Microsoft Entra ID");
  });

  it("labels generic OIDC with SSO prefix", () => {
    expect(labelForLinkedAuthAccount("acme-corp", "oidc")).toBe("SSO (Acme Corp)");
  });

  it("title-cases unknown OAuth providers", () => {
    expect(labelForLinkedAuthAccount("some-provider", "oauth")).toBe("Some Provider");
  });
});
