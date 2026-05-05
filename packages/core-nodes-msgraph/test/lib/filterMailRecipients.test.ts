import { describe, expect, it } from "vitest";
import { filterMailRecipients } from "../../src/lib/filterMailRecipients";

const alice = { emailAddress: { address: "alice@contoso.com", name: "Alice" } };
const bob = { emailAddress: { address: "bob@contoso.com", name: "Bob" } };
const carol = { emailAddress: { address: "carol@contoso.com", name: "Carol" } };

describe("filterMailRecipients", () => {
  it("returns recipients whose address is in the allowList", () => {
    const result = filterMailRecipients([alice, bob, carol], ["alice@contoso.com", "carol@contoso.com"]);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual(alice);
    expect(result).toContainEqual(carol);
  });

  it("is case-insensitive on both sides", () => {
    const result = filterMailRecipients([alice, bob], ["ALICE@CONTOSO.COM"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(alice);
  });

  it("returns an empty array when allowList is empty", () => {
    expect(filterMailRecipients([alice, bob], [])).toEqual([]);
  });

  it("returns an empty array when no recipients match", () => {
    expect(filterMailRecipients([alice, bob], ["nobody@other.com"])).toEqual([]);
  });

  it("returns an empty array when recipients list is empty", () => {
    expect(filterMailRecipients([], ["alice@contoso.com"])).toEqual([]);
  });

  it("handles mixed-case allowList entries", () => {
    const result = filterMailRecipients([alice, bob], ["Alice@Contoso.COM", "BOB@CONTOSO.COM"]);
    expect(result).toHaveLength(2);
  });

  it("preserves the original recipient objects (no mutation)", () => {
    const recipients = [alice, bob];
    const result = filterMailRecipients(recipients, ["alice@contoso.com"]);
    expect(result[0]).toBe(alice); // same reference
  });
});
