import { describe, expect, it } from "vitest";

import { InAppCallbackUrlPolicy } from "../../src/infrastructure/auth/InAppCallbackUrlPolicy";

describe("InAppCallbackUrlPolicy", () => {
  const policy = new InAppCallbackUrlPolicy();

  it("returns / for null, empty, or whitespace", () => {
    expect(policy.resolveSafeRelativeCallbackUrl(null)).toBe("/");
    expect(policy.resolveSafeRelativeCallbackUrl(undefined)).toBe("/");
    expect(policy.resolveSafeRelativeCallbackUrl("")).toBe("/");
    expect(policy.resolveSafeRelativeCallbackUrl("   ")).toBe("/");
  });

  it("allows simple relative in-app paths", () => {
    expect(policy.resolveSafeRelativeCallbackUrl("/")).toBe("/");
    expect(policy.resolveSafeRelativeCallbackUrl("/dashboard")).toBe("/dashboard");
    expect(policy.resolveSafeRelativeCallbackUrl("/workflows/foo")).toBe("/workflows/foo");
  });

  it("falls back to / for open-redirect and absolute targets", () => {
    expect(policy.resolveSafeRelativeCallbackUrl("https://evil.example/")).toBe("/");
    expect(policy.resolveSafeRelativeCallbackUrl("//evil.example/")).toBe("/");
    expect(policy.resolveSafeRelativeCallbackUrl("///evil.example/")).toBe("/");
    expect(policy.resolveSafeRelativeCallbackUrl("/\\evil.example")).toBe("/");
    expect(policy.resolveSafeRelativeCallbackUrl("javascript:alert(1)")).toBe("/");
  });

  it("falls back to / for control characters", () => {
    expect(policy.resolveSafeRelativeCallbackUrl("/bad\n")).toBe("/");
    expect(policy.resolveSafeRelativeCallbackUrl("/bad\x7f")).toBe("/");
  });
});
