import { describe, expect, it, vi } from "vitest";
import { register } from "../src/plugin";

describe("register", () => {
  it("registers the msgraph oauth credential type and the OnNewMail trigger node", () => {
    const registerCredentialType = vi.fn();
    const registerNode = vi.fn();
    const ctx = { registerCredentialType, registerNode } as unknown as Parameters<typeof register>[0];

    register(ctx);

    expect(registerCredentialType).toHaveBeenCalledTimes(1);
    expect(registerNode).toHaveBeenCalledTimes(1);
  });
});
