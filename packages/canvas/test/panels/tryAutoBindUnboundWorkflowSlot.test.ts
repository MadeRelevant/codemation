// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { tryAutoBindUnboundWorkflowSlot } from "../../src/panels/tryAutoBindUnboundWorkflowSlot";

function makeSlot(
  overrides: Partial<{ instanceId: string | null }> = {},
): Parameters<typeof tryAutoBindUnboundWorkflowSlot>[0] {
  return {
    nodeId: "node-1",
    workflowId: "workflow-1",
    requirement: {
      slotKey: "apiKey",
      label: "API Key",
      providerType: "openai",
      optional: false,
    },
    health: { status: "unbound" as const },
    instance:
      overrides.instanceId !== undefined
        ? { instanceId: overrides.instanceId as string, displayName: "My Credential", providerType: "openai" }
        : null,
  } as Parameters<typeof tryAutoBindUnboundWorkflowSlot>[0];
}

describe("tryAutoBindUnboundWorkflowSlot", () => {
  it("calls bindCredential when slot has no instance and instanceId is non-empty", () => {
    const bindCredentialImpl = vi.fn().mockResolvedValue(undefined);
    const slot = makeSlot({ instanceId: null });
    tryAutoBindUnboundWorkflowSlot(slot, "cred-123", bindCredentialImpl, "wf-1");
    expect(bindCredentialImpl).toHaveBeenCalledWith({
      workflowId: "wf-1",
      nodeId: "node-1",
      slotKey: "apiKey",
      instanceId: "cred-123",
    });
  });

  it("does nothing when slot already has an instance bound", () => {
    const bindCredentialImpl = vi.fn();
    const slot = makeSlot({ instanceId: "existing-cred" });
    tryAutoBindUnboundWorkflowSlot(slot, "cred-123", bindCredentialImpl, "wf-1");
    expect(bindCredentialImpl).not.toHaveBeenCalled();
  });

  it("does nothing when instanceId is an empty string", () => {
    const bindCredentialImpl = vi.fn();
    const slot = makeSlot({ instanceId: null });
    tryAutoBindUnboundWorkflowSlot(slot, "", bindCredentialImpl, "wf-1");
    expect(bindCredentialImpl).not.toHaveBeenCalled();
  });
});
