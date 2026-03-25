// @vitest-environment jsdom

import type { WorkflowCredentialHealthSlotDto } from "@codemation/host-src/application/contracts/CredentialContractsRegistry";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NodeCredentialBindingRow } from "../src/features/workflows/components/workflowDetail/NodeCredentialBindingRow";

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
  it("invokes onRequestNewCredential when New credential is clicked", () => {
    const onRequestNewCredential = vi.fn();
    render(
      <NodeCredentialBindingRow
        slot={baseSlot}
        compatibleInstances={[]}
        selectedInstanceId=""
        isBinding={false}
        onSelectInstance={vi.fn()}
        onBind={vi.fn()}
        onRequestNewCredential={onRequestNewCredential}
      />,
    );

    fireEvent.click(screen.getByTestId("node-properties-credential-slot-new-node-1-mail"));
    expect(onRequestNewCredential).toHaveBeenCalledTimes(1);
  });
});
