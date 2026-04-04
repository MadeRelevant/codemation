// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CodemationSessionRoot } from "../../src/providers/CodemationSessionProvider";
import { AppShellHeaderActions } from "../../src/shell/AppShellHeaderActions";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("AppShellHeaderActions", () => {
  it("renders nothing when UI auth is disabled and no session provider is present", () => {
    const view = render(
      <CodemationSessionRoot enabled={false}>
        <AppShellHeaderActions />
      </CodemationSessionRoot>,
    );

    expect(view.container).toBeEmptyDOMElement();
  });

  it("renders the authenticated header actions from the backend session endpoint", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ id: "user-1", email: "admin@example.com", name: "Admin" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    render(
      <CodemationSessionRoot enabled={true}>
        <AppShellHeaderActions />
      </CodemationSessionRoot>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("header-user-email").textContent).toContain("admin@example.com");
    });
    expect(screen.getByTestId("header-logout")).toBeInTheDocument();
  });
});
