// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { UsersInviteDialog } from "../../../src/features/users/components/UsersInviteDialog";

/**
 * Radix Dialog uses pointer capture + scroll APIs not present in JSDOM.
 * Install minimal stubs once at module load so they persist for all tests.
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

function renderDialog(overrides: Partial<Parameters<typeof UsersInviteDialog>[0]> = {}) {
  const props = {
    errorMessage: null,
    successUrl: null,
    isSubmitting: false,
    copyFeedback: false,
    onSubmit: () => {},
    onCopy: () => {},
    onClose: () => {},
    ...overrides,
  };
  return render(<UsersInviteDialog {...props} />);
}

afterEach(() => {
  // no globals overridden — nothing to restore
});

describe("UsersInviteDialog form validation", () => {
  it("renders the email input and submit button", () => {
    renderDialog();
    expect(screen.getByTestId("users-invite-email-input")).toBeInTheDocument();
    expect(screen.getByTestId("users-invite-submit")).toBeInTheDocument();
  });

  it("submits when a valid email is entered", async () => {
    let submitted: string | null = null;
    renderDialog({
      onSubmit: (email) => {
        submitted = email;
      },
    });

    fireEvent.change(screen.getByTestId("users-invite-email-input"), {
      target: { value: "colleague@company.com" },
    });
    fireEvent.submit(screen.getByTestId("users-invite-form"));

    await waitFor(() => {
      expect(submitted).toBe("colleague@company.com");
    });
  });

  it("blocks submit and shows an error for an email without @", async () => {
    let submitted = false;
    renderDialog({
      onSubmit: () => {
        submitted = true;
      },
    });

    fireEvent.change(screen.getByTestId("users-invite-email-input"), {
      target: { value: "notanemail" },
    });
    fireEvent.submit(screen.getByTestId("users-invite-form"));

    await waitFor(() => {
      expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    });
    expect(submitted).toBe(false);
  });

  it("blocks submit and shows an error for an email without domain", async () => {
    let submitted = false;
    renderDialog({
      onSubmit: () => {
        submitted = true;
      },
    });

    fireEvent.change(screen.getByTestId("users-invite-email-input"), {
      target: { value: "user@" },
    });
    fireEvent.submit(screen.getByTestId("users-invite-form"));

    await waitFor(() => {
      expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    });
    expect(submitted).toBe(false);
  });

  it("blocks submit and shows an error when email is empty", async () => {
    let submitted = false;
    renderDialog({
      onSubmit: () => {
        submitted = true;
      },
    });

    // Leave input empty and submit
    fireEvent.submit(screen.getByTestId("users-invite-form"));

    await waitFor(() => {
      expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    });
    expect(submitted).toBe(false);
  });

  it("shows a server error message when errorMessage prop is set", () => {
    renderDialog({ errorMessage: "This email is already registered." });
    expect(screen.getByTestId("users-invite-error")).toHaveTextContent("This email is already registered.");
  });

  it("shows the success link and Done button when successUrl is set", () => {
    renderDialog({ successUrl: "https://example.com/invite/abc" });
    expect(screen.getByTestId("users-invite-success-message")).toBeInTheDocument();
    expect(screen.getByTestId("users-invite-link-field")).toBeInTheDocument();
    expect(screen.queryByTestId("users-invite-form")).not.toBeInTheDocument();
  });
});
