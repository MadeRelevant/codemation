import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { UserAccountSessionPolicy } from "../../src/domain/users/UserAccountSessionPolicy";

describe("UserAccountSessionPolicy", () => {
  const policy = new UserAccountSessionPolicy();

  it("allows Better Auth sessions only for active accounts", () => {
    assert.equal(policy.allowsBetterAuthCookieSession("active"), true);
    assert.equal(policy.allowsBetterAuthCookieSession("invited"), false);
    assert.equal(policy.allowsBetterAuthCookieSession("inactive"), false);
  });

  it("treats invite token flows as invited-only", () => {
    assert.equal(policy.isEligibleForInviteTokenFlow("invited"), true);
    assert.equal(policy.isEligibleForInviteTokenFlow("active"), false);
    assert.equal(policy.isEligibleForInviteTokenFlow("inactive"), false);
  });
});
