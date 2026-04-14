// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NodeCredentialBindingRow } from "../../src/features/workflows/components/workflowDetail/NodeCredentialBindingRow";
import { installCredentialsJsdomPolyfills } from "./credentialsJsdomPolyfills";
import { testCredentialInstanceDto, testWorkflowCredentialHealthSlot } from "./factories/credentialUiTestFactories";

installCredentialsJsdomPolyfills();

const sampleInstance = testCredentialInstanceDto({
  instanceId: "ci-1",
  typeId: "gmail-oauth",
  displayName: "Mail",
});

const baseSlot = testWorkflowCredentialHealthSlot({
  workflowId: "wf-1",
  nodeId: "node-1",
  slotKey: "mail",
  acceptedTypes: ["gmail-oauth"],
  health: { status: "unbound" },
});

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
