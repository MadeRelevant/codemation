// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LoginPageClient } from "../../src/shell/LoginPageClient";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("LoginPageClient", () => {
  it("renders a guarded login form surface without relying on native submit button behavior", () => {
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
    expect(screen.getByTestId("login-submit")).toHaveAttribute("type", "button");
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

  it("posts credentials to Better Auth email sign-in without Codemation CSRF headers", async () => {
    let fetchUrl = "";
    let fetchInit: RequestInit | undefined;
    globalThis.fetch = async (input, init) => {
      fetchUrl = typeof input === "string" ? input : input.toString();
      fetchInit = init;
      return new Response(JSON.stringify({ message: "Invalid email or password" }), {
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
      expect(fetchUrl).toContain("/api/auth/sign-in/email");
    });
    expect(fetchInit?.method).toBe("POST");
    expect(fetchInit?.credentials).toBe("include");
    const headers = fetchInit?.headers;
    expect(headers).toBeDefined();
    if (headers instanceof Headers) {
      expect(headers.get("x-codemation-csrf-token")).toBeNull();
    } else {
      expect((headers as Record<string, string>)["x-codemation-csrf-token"]).toBeUndefined();
    }
    expect(JSON.parse(String(fetchInit?.body))).toEqual(
      expect.objectContaining({
        email: "admin@example.com",
        password: "password-123",
        callbackURL: "/dashboard",
      }),
    );
    await waitFor(() => {
      expect(screen.getByTestId("login-error")).toHaveTextContent("Invalid email or password.");
    });
  });

  it("shows a generic error message when sign-in fails with a non-401 server error", async () => {
    // Better Auth client returns { error: { status, message } } for non-ok responses.
    // Returning HTTP 500 with a JSON message triggers the non-401 error branch.
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: "Service unavailable" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });

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

    fireEvent.change(screen.getByTestId("login-email"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByTestId("login-password"), { target: { value: "password" } });
    fireEvent.submit(screen.getByTestId("login-form"));

    await waitFor(() => {
      expect(screen.getByTestId("login-error")).toBeInTheDocument();
    });
    // Should show either the server message or the fallback — not the 401-specific copy
    expect(screen.getByTestId("login-error")).not.toHaveTextContent("Invalid email or password.");
  });

  it("shows error when fetch rejects (network failure)", async () => {
    globalThis.fetch = async () => {
      throw new Error("network failure");
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

    fireEvent.change(screen.getByTestId("login-email"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByTestId("login-password"), { target: { value: "bad-pass" } });
    fireEvent.submit(screen.getByTestId("login-form"));

    await waitFor(() => {
      expect(screen.getByTestId("login-error")).toHaveTextContent("Something went wrong. Try again.");
    });
  });

  it("redirects to callbackUrl on successful credential sign-in", async () => {
    // Better Auth returns { data: { user, session, redirect: false }, error: null } on success.
    // The client then calls window.location.assign with the safe callback URL.
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          user: { id: "user-1", email: "admin@example.com" },
          session: { id: "sess-1" },
          redirect: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    const assignedUrls: string[] = [];
    const priorLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...window.location, assign: (url: string) => assignedUrls.push(url) },
    });

    try {
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

      fireEvent.change(screen.getByTestId("login-email"), { target: { value: "admin@example.com" } });
      fireEvent.change(screen.getByTestId("login-password"), { target: { value: "secret" } });
      fireEvent.submit(screen.getByTestId("login-form"));

      await waitFor(() => {
        expect(assignedUrls.length).toBe(1);
      });
      expect(assignedUrls[0]).toBe("/dashboard");
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: priorLocation,
      });
    }
  });

  it("shows generic error when sign-in returns error with non-object error field (readBetterFetchError non-object branch)", async () => {
    // error field present but not an object (e.g. a string) → readBetterFetchError returns { status: 500 }
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: "string-error" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });

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

    fireEvent.change(screen.getByTestId("login-email"), { target: { value: "u@example.com" } });
    fireEvent.change(screen.getByTestId("login-password"), { target: { value: "pw" } });
    fireEvent.submit(screen.getByTestId("login-form"));

    await waitFor(() => {
      expect(screen.getByTestId("login-error")).toBeInTheDocument();
    });
    expect(screen.getByTestId("login-error")).not.toHaveTextContent("Invalid email or password.");
  });

  it("triggers OAuth sign-in redirect when an OAuth provider button is clicked", async () => {
    const assignedUrls: string[] = [];
    const priorAssign = window.location.assign.bind(window.location);
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: {
        ...window.location,
        assign: (url: string) => {
          assignedUrls.push(url);
        },
      },
    });

    try {
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

      fireEvent.click(screen.getByTestId("login-oauth-github"));

      expect(assignedUrls.length).toBe(1);
      expect(assignedUrls[0]).toContain("github");
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: { ...window.location, assign: priorAssign },
      });
    }
  });
});
