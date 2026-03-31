// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LoginPageClient } from "../../src/shell/LoginPageClient";

describe("LoginPageClient", () => {
  it("renders a native submit button so pressing Enter submits the login form", () => {
    render(
      <LoginPageClient
        authStatus="resolved"
        callbackUrl="/dashboard"
        credentialsEnabled
        productName="Codemation"
        logoUrl={null}
        oauthProviders={[]}
      />,
    );

    expect(screen.getByTestId("login-form")).toBeInTheDocument();
    expect(screen.getByTestId("login-submit")).toHaveAttribute("type", "submit");
  });

  it("does not render login controls while auth resolution is failed", () => {
    render(
      <LoginPageClient
        authStatus="failed"
        authFailureMessage="providers unavailable"
        callbackUrl="/dashboard"
        credentialsEnabled={false}
        productName="Codemation"
        logoUrl={null}
        oauthProviders={[]}
      />,
    );

    expect(screen.queryByTestId("login-form")).not.toBeInTheDocument();
    expect(screen.getByTestId("login-auth-unavailable")).toHaveTextContent("providers unavailable");
  });

  it("renders OAuth-only login options when credentials are disabled", () => {
    render(
      <LoginPageClient
        authStatus="resolved"
        callbackUrl="/dashboard"
        credentialsEnabled={false}
        productName="Codemation"
        logoUrl={null}
        oauthProviders={[{ id: "github", name: "GitHub" }]}
      />,
    );

    expect(screen.queryByTestId("login-form")).not.toBeInTheDocument();
    expect(screen.getByTestId("login-oauth-github")).toBeInTheDocument();
  });

  it("renders a no-methods message when auth resolves without providers", () => {
    render(
      <LoginPageClient
        authStatus="resolved"
        callbackUrl="/dashboard"
        credentialsEnabled={false}
        productName="Codemation"
        logoUrl={null}
        oauthProviders={[]}
      />,
    );

    expect(screen.getByTestId("login-no-auth-methods")).toBeInTheDocument();
  });
});
