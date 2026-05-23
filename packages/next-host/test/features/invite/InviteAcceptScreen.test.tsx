// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { InviteAcceptScreen } from "../../../src/features/invite/screens/InviteAcceptScreen";

/**
 * InviteAcceptScreen calls codemationApiClient.getJson() (via globalThis.fetch) on mount.
 * ESLint forbids vi.stubGlobal — save and restore manually per AGENTS.md.
 */
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function makeFetch(responseBody: unknown, status = 200) {
  return async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
}

describe("InviteAcceptScreen — verify state gate", () => {
  it("shows the loading state before verify resolves", () => {
    // fetch never resolves — screen stays in pending
    globalThis.fetch = () => new Promise(() => {});

    render(<InviteAcceptScreen inviteToken="tok-pending" />);
    expect(screen.getByTestId("invite-accept-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("invite-accept-form")).not.toBeInTheDocument();
  });

  it("shows the invalid card and hides the activation form when verify returns invalid", async () => {
    globalThis.fetch = makeFetch({ valid: false });

    render(<InviteAcceptScreen inviteToken="tok-bad" />);

    await waitFor(() => {
      expect(screen.getByTestId("invite-accept-invalid")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("invite-accept-form")).not.toBeInTheDocument();
  });

  it("shows the activation form and hides the invalid card when verify returns valid", async () => {
    globalThis.fetch = makeFetch({ valid: true, email: "alice@example.com" });

    render(<InviteAcceptScreen inviteToken="tok-good" />);

    await waitFor(() => {
      expect(screen.getByTestId("invite-accept-form")).toBeInTheDocument();
    });
    expect(screen.getByTestId("invite-accept-email")).toHaveTextContent("alice@example.com");
    expect(screen.queryByTestId("invite-accept-invalid")).not.toBeInTheDocument();
  });

  it("shows the invalid card when fetch throws (network error)", async () => {
    globalThis.fetch = async () => {
      throw new Error("Network error");
    };

    render(<InviteAcceptScreen inviteToken="tok-network-error" />);

    await waitFor(() => {
      expect(screen.getByTestId("invite-accept-invalid")).toBeInTheDocument();
    });
  });
});

describe("InviteAcceptScreen — form validation", () => {
  async function renderValidScreen() {
    // First fetch = verify; subsequent fetch = accept (should not be called in error cases)
    let callCount = 0;
    globalThis.fetch = async (_input: RequestInfo | URL, _init?: RequestInit) => {
      callCount += 1;
      if (callCount === 1) {
        return new Response(JSON.stringify({ valid: true, email: "alice@example.com" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      // accept call — succeed
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    };

    render(<InviteAcceptScreen inviteToken="tok-valid" />);
    await waitFor(() => {
      expect(screen.getByTestId("invite-accept-form")).toBeInTheDocument();
    });
  }

  it("submit is blocked (error shown) when password is shorter than 8 characters", async () => {
    await renderValidScreen();

    fireEvent.change(screen.getByTestId("invite-accept-password"), { target: { value: "short" } });
    fireEvent.change(screen.getByTestId("invite-accept-confirm-password"), { target: { value: "short" } });
    fireEvent.submit(screen.getByTestId("invite-accept-password-form"));

    await waitFor(() => {
      expect(screen.getByTestId("invite-accept-error")).toHaveTextContent(/at least 8 characters/i);
    });
    expect(screen.queryByTestId("invite-accept-done")).not.toBeInTheDocument();
  });

  it("submit is blocked (error shown) when password and confirmPassword do not match", async () => {
    await renderValidScreen();

    fireEvent.change(screen.getByTestId("invite-accept-password"), { target: { value: "longenough1" } });
    fireEvent.change(screen.getByTestId("invite-accept-confirm-password"), { target: { value: "different123" } });
    fireEvent.submit(screen.getByTestId("invite-accept-password-form"));

    await waitFor(() => {
      expect(screen.getByTestId("invite-accept-error")).toHaveTextContent(/do not match/i);
    });
    expect(screen.queryByTestId("invite-accept-done")).not.toBeInTheDocument();
  });

  it("submit succeeds and shows the done screen when all conditions are met", async () => {
    await renderValidScreen();

    fireEvent.change(screen.getByTestId("invite-accept-password"), { target: { value: "SecurePass1!" } });
    fireEvent.change(screen.getByTestId("invite-accept-confirm-password"), { target: { value: "SecurePass1!" } });

    await act(async () => {
      fireEvent.submit(screen.getByTestId("invite-accept-password-form"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("invite-accept-done")).toBeInTheDocument();
    });
  });
});
