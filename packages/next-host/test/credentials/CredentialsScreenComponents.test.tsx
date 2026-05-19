// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CredentialsScreenHealthBadge } from "../../src/features/credentials/components/CredentialsScreenHealthBadge";
import { CredentialsScreenTestFailureAlert } from "../../src/features/credentials/components/CredentialsScreenTestFailureAlert";
import { CredentialsScreenInstancesTable } from "../../src/features/credentials/components/CredentialsScreenInstancesTable";
import type { CredentialInstanceDto } from "@codemation/canvas";

// ─── CredentialsScreenHealthBadge ────────────────────────────────────────────

describe("CredentialsScreenHealthBadge", () => {
  it("renders healthy status", () => {
    render(<CredentialsScreenHealthBadge status="healthy" />);
    expect(screen.getByText("healthy")).toBeInTheDocument();
  });

  it("renders failing status", () => {
    render(<CredentialsScreenHealthBadge status="failing" />);
    expect(screen.getByText("failing")).toBeInTheDocument();
  });

  it("renders unknown status", () => {
    render(<CredentialsScreenHealthBadge status="unknown" />);
    expect(screen.getByText("unknown")).toBeInTheDocument();
  });
});

// ─── CredentialsScreenTestFailureAlert ───────────────────────────────────────

describe("CredentialsScreenTestFailureAlert", () => {
  it("renders the alert with default message when no message prop", () => {
    render(<CredentialsScreenTestFailureAlert onDismiss={() => {}} />);
    const alert = screen.getByTestId("credential-test-failure-alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent("Test failed");
  });

  it("renders the custom message", () => {
    render(<CredentialsScreenTestFailureAlert message="Connection refused" onDismiss={() => {}} />);
    expect(screen.getByTestId("credential-test-failure-alert")).toHaveTextContent("Connection refused");
  });

  it("calls onDismiss when the dismiss button is clicked", () => {
    let dismissed = false;
    render(
      <CredentialsScreenTestFailureAlert
        onDismiss={() => {
          dismissed = true;
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("credential-test-failure-alert-dismiss"));
    expect(dismissed).toBe(true);
  });
});

// ─── CredentialsScreenInstancesTable ─────────────────────────────────────────

function makeInstance(overrides: Partial<CredentialInstanceDto> = {}): CredentialInstanceDto {
  return {
    instanceId: "inst-1",
    typeId: "openai",
    displayName: "OpenAI Key",
    sourceKind: "db",
    setupStatus: "ready",
    latestHealth: { status: "healthy" },
    ...overrides,
  };
}

describe("CredentialsScreenInstancesTable", () => {
  function renderTable(
    overrides: {
      instances?: ReadonlyArray<CredentialInstanceDto>;
      testResult?: { instanceId: string; status: string; message?: string } | null;
      activeTestInstanceId?: string | null;
    } = {},
  ) {
    const instances = overrides.instances ?? [makeInstance()];
    return render(
      <CredentialsScreenInstancesTable
        credentialInstances={instances}
        testResult={overrides.testResult ?? null}
        activeTestInstanceId={overrides.activeTestInstanceId ?? null}
        onOpenEdit={() => {}}
        onTest={async () => {}}
        onOpenDelete={() => {}}
      />,
    );
  }

  it("renders a row for each credential instance", () => {
    renderTable({
      instances: [
        makeInstance({ instanceId: "inst-1", displayName: "Key A" }),
        makeInstance({ instanceId: "inst-2", displayName: "Key B" }),
      ],
    });
    expect(screen.getByTestId("credential-instance-row-inst-1")).toBeInTheDocument();
    expect(screen.getByTestId("credential-instance-row-inst-2")).toBeInTheDocument();
  });

  it("shows the instance display name as a clickable link", () => {
    renderTable();
    expect(screen.getByTestId("credential-instance-name-inst-1")).toHaveTextContent("OpenAI Key");
  });

  it("calls onOpenEdit when the instance name is clicked", () => {
    let editTarget: CredentialInstanceDto | null = null;
    const instance = makeInstance();
    render(
      <CredentialsScreenInstancesTable
        credentialInstances={[instance]}
        testResult={null}
        activeTestInstanceId={null}
        onOpenEdit={(inst) => {
          editTarget = inst;
        }}
        onTest={async () => {}}
        onOpenDelete={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("credential-instance-name-inst-1"));
    expect(editTarget).toBe(instance);
  });

  it("calls onOpenDelete when the delete button is clicked", () => {
    let deleteTarget: CredentialInstanceDto | null = null;
    const instance = makeInstance();
    render(
      <CredentialsScreenInstancesTable
        credentialInstances={[instance]}
        testResult={null}
        activeTestInstanceId={null}
        onOpenEdit={() => {}}
        onTest={async () => {}}
        onOpenDelete={(inst) => {
          deleteTarget = inst;
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("credential-instance-delete-button-inst-1"));
    expect(deleteTarget).toBe(instance);
  });

  it("shows test result healthy indicator for the matching instance", () => {
    renderTable({ testResult: { instanceId: "inst-1", status: "healthy" } });
    expect(screen.getByTestId("credential-test-result-inst-1")).toHaveTextContent("Healthy");
  });

  it("shows test result failing indicator for a failed test", () => {
    renderTable({ testResult: { instanceId: "inst-1", status: "failing" } });
    expect(screen.getByTestId("credential-test-result-inst-1")).toHaveTextContent("Failing");
  });

  it("disables the Test button while testing the instance", () => {
    renderTable({ activeTestInstanceId: "inst-1" });
    const btn = screen.getByTestId("credential-instance-test-button-inst-1");
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent("Testing…");
  });

  it("shows 'Test' button text when not actively testing", () => {
    renderTable();
    expect(screen.getByTestId("credential-instance-test-button-inst-1")).toHaveTextContent("Test");
  });
});
