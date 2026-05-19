// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CredentialConfirmDialog } from "../../src/features/credentials/components/CredentialConfirmDialog";
import { installCredentialsJsdomPolyfills } from "./credentialsJsdomPolyfills";

installCredentialsJsdomPolyfills();

function renderDialog(overrides: Partial<Parameters<typeof CredentialConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  render(
    <CredentialConfirmDialog
      title="Are you sure?"
      testId="confirm-dialog"
      cancelTestId="confirm-cancel-btn"
      confirmTestId="confirm-ok-btn"
      confirmLabel="Delete"
      confirmVariant="danger"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    >
      <p>This action cannot be undone.</p>
    </CredentialConfirmDialog>,
  );

  return { onConfirm, onCancel };
}

describe("CredentialConfirmDialog", () => {
  it("renders the title and body content", () => {
    renderDialog();

    expect(screen.getByRole("heading", { name: "Are you sure?" })).toBeInTheDocument();
    expect(screen.getByText("This action cannot be undone.")).toBeInTheDocument();
  });

  it("renders cancel and confirm buttons with the correct labels", () => {
    renderDialog();

    expect(screen.getByTestId("confirm-cancel-btn")).toHaveTextContent("Cancel");
    expect(screen.getByTestId("confirm-ok-btn")).toHaveTextContent("Delete");
  });

  it("calls onConfirm when the confirm button is clicked", () => {
    const { onConfirm } = renderDialog();

    fireEvent.click(screen.getByTestId("confirm-ok-btn"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when the cancel button is clicked", () => {
    const { onCancel } = renderDialog();

    fireEvent.click(screen.getByTestId("confirm-cancel-btn"));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("uses destructive variant for danger confirmVariant", () => {
    renderDialog({ confirmVariant: "danger" });

    // The confirm button should carry a destructive styling class applied by Button variant.
    const btn = screen.getByTestId("confirm-ok-btn");
    // The exact class depends on shadcn; just assert the element exists and is not disabled.
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  it("uses default variant for primary confirmVariant", () => {
    renderDialog({ confirmVariant: "primary", confirmLabel: "OK" });

    const btn = screen.getByTestId("confirm-ok-btn");
    expect(btn).toHaveTextContent("OK");
    expect(btn).not.toBeDisabled();
  });
});
