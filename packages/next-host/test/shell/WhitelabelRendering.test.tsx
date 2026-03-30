// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WhitelabelProvider } from "../../src/providers/WhitelabelProvider";
import { AppLayoutSidebarBrand } from "../../src/shell/AppLayoutSidebarBrand";
import { LoginPageClient } from "../../src/shell/LoginPageClient";

describe("whitelabel rendering", () => {
  it("renders the configured product name on the login page", () => {
    render(
      <LoginPageClient callbackUrl="/dashboard" productName="My automationnn" logoUrl={null} oauthProviders={[]} />,
    );

    expect(screen.getByTestId("login-whitelabel-product-name").textContent).toContain("My automationnn");
    expect(screen.getByTestId("login-whitelabel-tagline").textContent).toContain("My automationnn");
  });

  it("renders the configured product name in the sidebar brand", () => {
    render(
      <WhitelabelProvider value={{ productName: "My automationnn", logoUrl: null }}>
        <AppLayoutSidebarBrand collapsed={false} />
      </WhitelabelProvider>,
    );

    expect(screen.getByTestId("sidebar-whitelabel-product-name").textContent).toContain("My automationnn");
  });
});
