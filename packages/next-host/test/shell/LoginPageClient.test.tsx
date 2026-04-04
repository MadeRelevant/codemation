// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LoginPageClient } from "../../src/shell/LoginPageClient";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  document.cookie = "codemation.csrf-token=; Max-Age=0; path=/";
});

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

  it("posts credentials to the backend login endpoint with the CSRF header", async () => {
    document.cookie = "codemation.csrf-token=test-csrf; path=/";
    let fetchUrl = "";
    let fetchInit: RequestInit | undefined;
    globalThis.fetch = async (input, init) => {
      fetchUrl = typeof input === "string" ? input : input.toString();
      fetchInit = init;
      return new Response(JSON.stringify({ error: "Invalid email or password." }), {
        status: 401,
        headers: {
          "content-type": "application/json",
        },
      });
    };
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

    fireEvent.change(screen.getByTestId("login-email"), {
      target: { value: "admin@example.com" },
    });
    fireEvent.change(screen.getByTestId("login-password"), {
      target: { value: "password-123" },
    });
    fireEvent.submit(screen.getByTestId("login-form"));

    await waitFor(() => {
      expect(fetchUrl).toBe("/api/auth/login");
    });
    expect(fetchInit?.method).toBe("POST");
    expect(fetchInit?.credentials).toBe("include");
    expect((fetchInit?.headers as Record<string, string>)["x-codemation-csrf-token"]).toBe("test-csrf");
    expect(fetchInit?.body).toBe(JSON.stringify({ email: "admin@example.com", password: "password-123" }));
    await waitFor(() => {
      expect(screen.getByTestId("login-error")).toHaveTextContent("Invalid email or password.");
    });
  });
});
