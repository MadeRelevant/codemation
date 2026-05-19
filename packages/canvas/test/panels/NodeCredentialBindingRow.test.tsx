// @vitest-environment jsdom

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NodeCredentialBindingRow } from "../../src/panels/NodeCredentialBindingRow";
import type { WorkflowCredentialHealthSlotDto } from "@codemation/host/dto";

type HealthStatus = WorkflowCredentialHealthSlotDto["health"]["status"];

function makeSlot(healthStatus: HealthStatus = "unbound", message?: string): WorkflowCredentialHealthSlotDto {
  return {
    nodeId: "node-1",
    workflowId: "wf-1",
    requirement: {
      slotKey: "apiKey",
      label: "API Key",
      providerType: "openai",
      optional: false,
    },
    health: { status: healthStatus, message },
    instance: null,
  } as unknown as WorkflowCredentialHealthSlotDto;
}

function makeInstance(instanceId: string, displayName: string) {
  return { instanceId, displayName, providerType: "openai" };
}

const BASE_PROPS = {
  slot: makeSlot("unbound"),
  compatibleInstances: [],
  allCredentialInstances: [],
  selectedInstanceId: "",
  isBinding: false,
  onSelectInstance: vi.fn(),
  onBind: vi.fn(),
  onEditCredential: vi.fn(),
  onRequestNewCredential: vi.fn(),
};

describe("NodeCredentialBindingRow", () => {
  it("renders the slot label", () => {
    render(<NodeCredentialBindingRow {...BASE_PROPS} />);
    expect(screen.getByText("API Key")).toBeInTheDocument();
  });

  it("renders the testid container with node/slot suffix", () => {
    render(<NodeCredentialBindingRow {...BASE_PROPS} />);
    expect(screen.getByTestId("node-properties-credential-slot-node-1-apiKey")).toBeInTheDocument();
  });

  it("renders the Bind button", () => {
    render(<NodeCredentialBindingRow {...BASE_PROPS} />);
    expect(screen.getByTestId("node-properties-credential-slot-bind-node-1-apiKey")).toBeInTheDocument();
  });

  it("disables Bind button when selectedInstanceId is empty", () => {
    render(<NodeCredentialBindingRow {...BASE_PROPS} selectedInstanceId="" />);
    expect(screen.getByTestId("node-properties-credential-slot-bind-node-1-apiKey")).toBeDisabled();
  });

  it("disables Bind button when isBinding is true", () => {
    render(<NodeCredentialBindingRow {...BASE_PROPS} selectedInstanceId="some-id" isBinding />);
    expect(screen.getByTestId("node-properties-credential-slot-bind-node-1-apiKey")).toBeDisabled();
  });

  it("shows 'Binding…' text when isBinding is true", () => {
    render(<NodeCredentialBindingRow {...BASE_PROPS} selectedInstanceId="some-id" isBinding />);
    expect(screen.getByText("Binding…")).toBeInTheDocument();
  });

  it("enables Bind button when selectedInstanceId is set and not binding", () => {
    render(<NodeCredentialBindingRow {...BASE_PROPS} selectedInstanceId="cred-1" isBinding={false} />);
    expect(screen.getByTestId("node-properties-credential-slot-bind-node-1-apiKey")).not.toBeDisabled();
  });

  it("calls onBind with correct request when Bind button is clicked", () => {
    const onBind = vi.fn();
    render(<NodeCredentialBindingRow {...BASE_PROPS} selectedInstanceId="cred-1" onBind={onBind} />);
    fireEvent.click(screen.getByTestId("node-properties-credential-slot-bind-node-1-apiKey"));
    expect(onBind).toHaveBeenCalledWith({
      workflowId: "wf-1",
      nodeId: "node-1",
      slotKey: "apiKey",
      instanceId: "cred-1",
    });
  });

  it("disables Edit button when no credential is selected", () => {
    render(<NodeCredentialBindingRow {...BASE_PROPS} selectedInstanceId="" />);
    expect(screen.getByTestId("node-properties-credential-slot-edit-node-1-apiKey")).toBeDisabled();
  });

  it("enables Edit button when a compatible credential is selected", () => {
    const instances = [makeInstance("cred-1", "My Cred")];
    render(
      <NodeCredentialBindingRow
        {...BASE_PROPS}
        compatibleInstances={instances}
        allCredentialInstances={instances}
        selectedInstanceId="cred-1"
      />,
    );
    expect(screen.getByTestId("node-properties-credential-slot-edit-node-1-apiKey")).not.toBeDisabled();
  });

  it("calls onEditCredential with the found instance when Edit is clicked", () => {
    const onEditCredential = vi.fn();
    const instances = [makeInstance("cred-1", "My Cred")];
    render(
      <NodeCredentialBindingRow
        {...BASE_PROPS}
        compatibleInstances={instances}
        allCredentialInstances={instances}
        selectedInstanceId="cred-1"
        onEditCredential={onEditCredential}
      />,
    );
    fireEvent.click(screen.getByTestId("node-properties-credential-slot-edit-node-1-apiKey"));
    expect(onEditCredential).toHaveBeenCalledWith(instances[0]);
  });

  it("shows health message when provided", () => {
    const slot = makeSlot("failing", "Token expired");
    render(<NodeCredentialBindingRow {...BASE_PROPS} slot={slot} />);
    expect(screen.getByText("Token expired")).toBeInTheDocument();
  });

  it("renders the status indicator for healthy status", () => {
    const slot = makeSlot("healthy");
    render(<NodeCredentialBindingRow {...BASE_PROPS} slot={slot} />);
    expect(screen.getByTestId("node-properties-credential-slot-status-node-1-apiKey")).toBeInTheDocument();
  });

  it("renders the new credential select item", () => {
    // Open the select to see the new credential option
    render(<NodeCredentialBindingRow {...BASE_PROPS} />);
    const selectTrigger = screen.getByTestId("node-properties-credential-slot-select-node-1-apiKey");
    // Just verify it renders without error
    expect(selectTrigger).toBeInTheDocument();
  });

  it("renders optional-unbound health status icon", () => {
    const slot = makeSlot("optional-unbound");
    render(<NodeCredentialBindingRow {...BASE_PROPS} slot={slot} />);
    expect(screen.getByTestId("node-properties-credential-slot-status-node-1-apiKey")).toBeInTheDocument();
  });

  it("renders unknown health status icon for unrecognized status", () => {
    const slot = makeSlot("unknown-status" as any);
    render(<NodeCredentialBindingRow {...BASE_PROPS} slot={slot} />);
    expect(screen.getByTestId("node-properties-credential-slot-status-node-1-apiKey")).toBeInTheDocument();
  });

  it("resolves selected instance from allCredentialInstances when not in compatibleInstances", () => {
    // Instance that is selected but not in compatibleInstances - found via allCredentialInstances
    const compatibleInstances: { instanceId: string; displayName: string; providerType: string }[] = [];
    const allCredentialInstances = [makeInstance("cred-from-all", "Legacy Credential")];
    const onEditCredential = vi.fn();
    render(
      <NodeCredentialBindingRow
        {...BASE_PROPS}
        compatibleInstances={compatibleInstances}
        allCredentialInstances={allCredentialInstances}
        selectedInstanceId="cred-from-all"
        onEditCredential={onEditCredential}
      />,
    );
    // Should enable edit button since instance was found in allCredentialInstances
    expect(screen.getByTestId("node-properties-credential-slot-edit-node-1-apiKey")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("node-properties-credential-slot-edit-node-1-apiKey"));
    expect(onEditCredential).toHaveBeenCalledWith(allCredentialInstances[0]);
  });
});
