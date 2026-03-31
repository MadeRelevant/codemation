// @vitest-environment jsdom

import type { Session } from "next-auth";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CodemationSessionRoot } from "../../src/providers/CodemationSessionProvider";
import { AppShellHeaderActions } from "../../src/shell/AppShellHeaderActions";

describe("AppShellHeaderActions", () => {
  it("renders nothing when UI auth is disabled and no session provider is present", () => {
    const view = render(
      <CodemationSessionRoot enabled={false} session={null}>
        <AppShellHeaderActions />
      </CodemationSessionRoot>,
    );

    expect(view.container).toBeEmptyDOMElement();
  });

  it("renders the authenticated header actions when session auth is enabled", () => {
    const session: Session = {
      user: {
        email: "admin@example.com",
      },
      expires: "2099-01-01T00:00:00.000Z",
    };

    render(
      <CodemationSessionRoot enabled={true} session={session}>
        <AppShellHeaderActions />
      </CodemationSessionRoot>,
    );

    expect(screen.getByTestId("header-user-email").textContent).toContain("admin@example.com");
    expect(screen.getByTestId("header-logout")).toBeInTheDocument();
  });
});
