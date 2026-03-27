// @vitest-environment jsdom

import type { WorkflowCredentialHealthSlotDto } from "@codemation/host-src/application/contracts/CredentialContractsRegistry";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { CredentialInstanceDto } from "../../src/features/workflows/hooks/realtime/realtime";
import { NodeCredentialBindingRow } from "../../src/features/workflows/components/workflowDetail/NodeCredentialBindingRow";

beforeAll(() => {
  if (typeof Element.prototype.hasPointerCapture !== "function") {
    Element.prototype.hasPointerCapture = (): boolean => false;
  }
  if (typeof Element.prototype.setPointerCapture !== "function") {
    Element.prototype.setPointerCapture = (): void => {};
  }
  if (typeof Element.prototype.releasePointerCapture !== "function") {
    Element.prototype.releasePointerCapture = (): void => {};
  }
  if (typeof Element.prototype.scrollIntoView !== "function") {
    Element.prototype.scrollIntoView = (): void => {};
  }
});

const sampleInstance: CredentialInstanceDto = {
  instanceId: "ci-1",
  typeId: "gmail-oauth",
  displayName: "Mail",
  sourceKind: "db",
  publicConfig: {},
  tags: [],
  setupStatus: "ready",
  createdAt: "",
  updatedAt: "",
};

const baseSlot: WorkflowCredentialHealthSlotDto = {
  workflowId: "wf-1",
  nodeId: "node-1",
  requirement: {
    slotKey: "mail",
    label: "Mail",
    acceptedTypes: ["gmail-oauth"],
  },
  health: { status: "unbound" },
};

describe("NodeCredentialBindingRow", () => {
  it("invokes onRequestNewCredential when New credential is clicked", async () => {
    const onRequestNewCredential = vi.fn();
    render(
      <NodeCredentialBindingRow
        slot={baseSlot}
        compatibleInstances={[]}
        allCredentialInstances={[]}
        selectedInstanceId=""
        isBinding={false}
        onSelectInstance={vi.fn()}
        onBind={vi.fn()}
        onEditCredential={vi.fn()}
        onRequestNewCredential={onRequestNewCredential}
      />,
    );

    fireEvent.click(screen.getByTestId("node-properties-credential-slot-select-node-1-mail"));
    const newItem = await screen.findByTestId("node-properties-credential-slot-new-node-1-mail");
    fireEvent.click(newItem);
    await waitFor(() => {
      expect(onRequestNewCredential).toHaveBeenCalledTimes(1);
    });
  });

  it("invokes onEditCredential when Edit is clicked and an instance is selected", () => {
    const onEditCredential = vi.fn();
    render(
      <NodeCredentialBindingRow
        slot={baseSlot}
        compatibleInstances={[sampleInstance]}
        allCredentialInstances={[sampleInstance]}
        selectedInstanceId="ci-1"
        isBinding={false}
        onSelectInstance={vi.fn()}
        onBind={vi.fn()}
        onEditCredential={onEditCredential}
        onRequestNewCredential={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("node-properties-credential-slot-edit-node-1-mail"));
    expect(onEditCredential).toHaveBeenCalledWith(sampleInstance);
  });
});
