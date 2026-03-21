import { describe,expect,it } from "vitest";
import {
withInviteUserResponseLoginMethodsDefaults,
withUserAccountLoginMethodsDefaults,
} from "../src/application/contracts/userDirectoryContracts.types";

describe("withUserAccountLoginMethodsDefaults", () => {
  it("preserves a valid loginMethods array", () => {
    const u = withUserAccountLoginMethodsDefaults({
      id: "1",
      email: "a@test.com",
      status: "active",
      inviteExpiresAt: null,
      loginMethods: ["Password", "Google"],
    });
    expect(u.loginMethods).toEqual(["Password", "Google"]);
  });

  it("defaults missing loginMethods to empty array", () => {
    const u = withUserAccountLoginMethodsDefaults({
      id: "1",
      email: "a@test.com",
      status: "active",
      inviteExpiresAt: null,
    });
    expect(u.loginMethods).toEqual([]);
  });

  it("treats non-array loginMethods as empty", () => {
    const u = withUserAccountLoginMethodsDefaults({
      id: "1",
      email: "a@test.com",
      status: "active",
      inviteExpiresAt: null,
      loginMethods: null as unknown as string[],
    });
    expect(u.loginMethods).toEqual([]);
  });
});

describe("withInviteUserResponseLoginMethodsDefaults", () => {
  it("normalizes nested user", () => {
    const r = withInviteUserResponseLoginMethodsDefaults({
      inviteUrl: "http://localhost/invite/x",
      user: {
        id: "1",
        email: "a@test.com",
        status: "invited",
        inviteExpiresAt: null,
      },
    });
    expect(r.user.loginMethods).toEqual([]);
  });
});
