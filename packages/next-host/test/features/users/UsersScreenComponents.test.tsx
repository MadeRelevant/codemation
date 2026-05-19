// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UsersScreenUserStatusBadge } from "../../../src/features/users/components/UsersScreenUserStatusBadge";
import { UsersRegenerateDialog } from "../../../src/features/users/components/UsersRegenerateDialog";

/**
 * Radix Dialog uses pointer capture APIs not present in JSDOM. Install minimal stubs.
 */
function installDialogPolyfills(): void {
  if (typeof window === "undefined") return;
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
}

installDialogPolyfills();

// ─── UsersScreenUserStatusBadge ───────────────────────────────────────────────

describe("UsersScreenUserStatusBadge", () => {
  it("renders 'active' status text", () => {
    render(<UsersScreenUserStatusBadge userId="u1" status="active" />);
    const badge = screen.getByTestId("user-status-badge-u1");
    expect(badge).toHaveTextContent("active");
  });

  it("renders 'invited' status text", () => {
    render(<UsersScreenUserStatusBadge userId="u2" status="invited" />);
    const badge = screen.getByTestId("user-status-badge-u2");
    expect(badge).toHaveTextContent("invited");
  });

  it("renders 'inactive' status text", () => {
    render(<UsersScreenUserStatusBadge userId="u3" status="inactive" />);
    const badge = screen.getByTestId("user-status-badge-u3");
    expect(badge).toHaveTextContent("inactive");
  });
});

// ─── UsersRegenerateDialog ────────────────────────────────────────────────────

function renderRegenerateDialog(overrides: Partial<Parameters<typeof UsersRegenerateDialog>[0]> = {}) {
  const props = {
    email: "user@example.com",
    newUrl: null,
    errorMessage: null,
    isSubmitting: false,
    copyFeedback: false,
    onConfirm: () => {},
    onCopy: () => {},
    onClose: () => {},
    ...overrides,
  };
  return render(<UsersRegenerateDialog {...props} />);
}

describe("UsersRegenerateDialog", () => {
  it("shows confirm text with email and Regenerate button when no newUrl", () => {
    renderRegenerateDialog();
    expect(screen.getByTestId("users-regenerate-confirm-text")).toBeInTheDocument();
    expect(screen.getByTestId("users-regenerate-email")).toHaveTextContent("user@example.com");
    expect(screen.getByTestId("users-regenerate-confirm")).toBeInTheDocument();
    expect(screen.getByTestId("users-regenerate-cancel")).toHaveTextContent("Cancel");
  });

  it("shows success message and link when newUrl is provided", () => {
    renderRegenerateDialog({ newUrl: "https://example.com/invite/new123" });
    expect(screen.getByTestId("users-regenerate-success-message")).toBeInTheDocument();
    // Link field is a div (not an input) that renders the URL as text
    expect(screen.getByTestId("users-regenerate-link-field")).toHaveTextContent("https://example.com/invite/new123");
    // Confirm button should not be visible in the success state
    expect(screen.queryByTestId("users-regenerate-confirm")).not.toBeInTheDocument();
    expect(screen.getByTestId("users-regenerate-cancel")).toHaveTextContent("Close");
  });

  it("shows error message when errorMessage is set", () => {
    renderRegenerateDialog({ errorMessage: "Network error" });
    expect(screen.getByTestId("users-regenerate-error")).toHaveTextContent("Network error");
  });

  it("disables the Regenerate button while submitting", () => {
    renderRegenerateDialog({ isSubmitting: true });
    const btn = screen.getByTestId("users-regenerate-confirm");
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent("Working…");
  });

  it("calls onConfirm when Regenerate is clicked", () => {
    let confirmed = false;
    renderRegenerateDialog({
      onConfirm: () => {
        confirmed = true;
      },
    });
    fireEvent.click(screen.getByTestId("users-regenerate-confirm"));
    expect(confirmed).toBe(true);
  });

  it("calls onClose when Cancel is clicked", () => {
    let closed = false;
    renderRegenerateDialog({
      onClose: () => {
        closed = true;
      },
    });
    fireEvent.click(screen.getByTestId("users-regenerate-cancel"));
    expect(closed).toBe(true);
  });
});
