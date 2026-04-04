// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("renders the authenticated header actions from Better Auth get-session", async () => {
    globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (!url.includes("get-session")) {
        return new Response("unexpected", { status: 500 });
      }
      return new Response(
        JSON.stringify({
          session: { id: "sess-1", userId: "user-1" },
          user: { id: "user-1", email: "admin@example.com", name: "Admin" },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    };
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

  it("posts Better Auth sign-out when the user logs out", async () => {
    const requestedUrls: string[] = [];
    let sawGetSession = false;
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      requestedUrls.push(url);
      if (url.includes("get-session")) {
        sawGetSession = true;
        return new Response(
          JSON.stringify({
            session: { id: "sess-1", userId: "user-1" },
            user: { id: "user-1", email: "admin@example.com", name: "Admin" },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.includes("sign-out")) {
        expect(init?.method).toBe("POST");
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    };

    render(
      <CodemationSessionRoot enabled={true}>
        <AppShellHeaderActions />
      </CodemationSessionRoot>,
    );

    await waitFor(() => {
      expect(sawGetSession).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByTestId("header-logout")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("header-logout"));

    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes("sign-out"))).toBe(true);
    });
  });
});
