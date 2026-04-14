import type { UpsertCredentialBindingRequest } from "@codemation/host-src/application/contracts/CredentialContractsRegistry";
import { describe, expect, it, vi } from "vitest";

import { tryAutoBindUnboundWorkflowSlot } from "../../src/features/workflows/components/workflowDetail/tryAutoBindUnboundWorkflowSlot";
import { testWorkflowCredentialHealthSlot } from "./factories/credentialUiTestFactories";

describe("tryAutoBindUnboundWorkflowSlot", () => {
  const workflowId = "wf-1";
  const unboundSlot = testWorkflowCredentialHealthSlot({
    workflowId,
    nodeId: "n1",
    slotKey: "mail",
    acceptedTypes: ["gmail-oauth"],
    health: { status: "unbound" },
  });

  const boundSlot = testWorkflowCredentialHealthSlot({
    workflowId,
    nodeId: "n1",
    slotKey: "mail",
    acceptedTypes: ["gmail-oauth"],
    health: { status: "healthy" },
    instance: {
      instanceId: "existing",
      typeId: "gmail-oauth",
      displayName: "X",
      setupStatus: "ready",
    },
  });

  it("calls bind when the slot has no instance and instanceId is non-empty", async () => {
    const bind = vi.fn(async (_request: UpsertCredentialBindingRequest): Promise<void> => {});
    tryAutoBindUnboundWorkflowSlot(unboundSlot, "new-id", bind, workflowId);
    expect(bind).toHaveBeenCalledTimes(1);
    expect(bind).toHaveBeenCalledWith({
      workflowId,
      nodeId: "n1",
      slotKey: "mail",
      instanceId: "new-id",
    });
    await Promise.resolve();
  });

  it("does not bind when instanceId is empty", () => {
    const bind = vi.fn();
    tryAutoBindUnboundWorkflowSlot(unboundSlot, "", bind, workflowId);
    expect(bind).not.toHaveBeenCalled();
  });

  it("does not bind when the slot already has an instance", () => {
    const bind = vi.fn();
    tryAutoBindUnboundWorkflowSlot(boundSlot, "other-id", bind, workflowId);
    expect(bind).not.toHaveBeenCalled();
  });
});
