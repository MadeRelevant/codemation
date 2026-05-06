import { describe, expect, it } from "vitest";
import { drivePathPrefix, mailboxPathPrefix } from "../../src/lib/graphPaths";

describe("mailboxPathPrefix", () => {
  it("returns /me for an empty string", () => {
    expect(mailboxPathPrefix("")).toBe("/me");
  });

  it('returns /me for "me"', () => {
    expect(mailboxPathPrefix("me")).toBe("/me");
  });

  it('returns /me for "Me" (case-insensitive)', () => {
    expect(mailboxPathPrefix("Me")).toBe("/me");
  });

  it('returns /me for "self"', () => {
    expect(mailboxPathPrefix("self")).toBe("/me");
  });

  it('returns /me for "SELF" (case-insensitive)', () => {
    expect(mailboxPathPrefix("SELF")).toBe("/me");
  });

  it("encodes a UPN as /users/{upn}", () => {
    expect(mailboxPathPrefix("alice@contoso.com")).toBe("/users/alice%40contoso.com");
  });

  it("encodes a UPN with special characters", () => {
    expect(mailboxPathPrefix("user+tag@example.com")).toBe("/users/user%2Btag%40example.com");
  });

  it("trims surrounding whitespace before encoding", () => {
    expect(mailboxPathPrefix("  alice@contoso.com  ")).toBe("/users/alice%40contoso.com");
  });
});

describe("drivePathPrefix", () => {
  it("builds the canonical /drives/{driveId}/items/{itemId} path", () => {
    expect(drivePathPrefix({ driveId: "drive-abc", itemId: "item-xyz" })).toBe("/drives/drive-abc/items/item-xyz");
  });

  it("encodes special characters in driveId and itemId", () => {
    expect(drivePathPrefix({ driveId: "b!abc+def", itemId: "01ABC/DEF" })).toBe(
      "/drives/b!abc%2Bdef/items/01ABC%2FDEF",
    );
  });
});
