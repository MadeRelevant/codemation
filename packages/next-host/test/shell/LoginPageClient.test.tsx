// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LoginPageClient } from "../../src/shell/LoginPageClient";

describe("LoginPageClient", () => {
  it("renders a native submit button so pressing Enter submits the login form", () => {
    render(<LoginPageClient callbackUrl="/dashboard" productName="Codemation" logoUrl={null} oauthProviders={[]} />);

    expect(screen.getByTestId("login-form")).toBeInTheDocument();
    expect(screen.getByTestId("login-submit")).toHaveAttribute("type", "submit");
  });
});
