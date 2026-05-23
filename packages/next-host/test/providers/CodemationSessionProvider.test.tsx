// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CodemationSessionRoot, CodemationSessionRootContext } from "../../src/providers/CodemationSessionProvider";
import { useContext } from "react";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function SessionDisplay() {
  const ctx = useContext(CodemationSessionRootContext);
  return (
    <div>
      <span data-testid="status">{ctx.status}</span>
      <span data-testid="enabled">{String(ctx.enabled)}</span>
      <span data-testid="session-id">{ctx.session?.id ?? "null"}</span>
    </div>
  );
}

describe("CodemationSessionRoot", () => {
  it("is anonymous and skips fetch when enabled=false", () => {
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response("{}", { status: 200 });
    };

    render(
      <CodemationSessionRoot enabled={false}>
        <SessionDisplay />
      </CodemationSessionRoot>,
    );

    expect(screen.getByTestId("status")).toHaveTextContent("anonymous");
    expect(screen.getByTestId("enabled")).toHaveTextContent("false");
    expect(fetchCalled).toBe(false);
  });

  it("resolves to authenticated when get-session returns a valid user payload", async () => {
    globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("get-session")) {
        return new Response(
          JSON.stringify({
            session: { id: "sess-1", userId: "user-42" },
            user: { id: "user-42", email: "alice@example.com", name: "Alice" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("{}", { status: 200 });
    };

    render(
      <CodemationSessionRoot enabled={true}>
        <SessionDisplay />
      </CodemationSessionRoot>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    });
    expect(screen.getByTestId("session-id")).toHaveTextContent("user-42");
  });

  it("falls back to anonymous when get-session returns null", async () => {
    globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("get-session")) {
        return new Response("null", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("{}", { status: 200 });
    };

    render(
      <CodemationSessionRoot enabled={true}>
        <SessionDisplay />
      </CodemationSessionRoot>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status")).not.toHaveTextContent("loading");
    });
    expect(screen.getByTestId("status")).toHaveTextContent("anonymous");
  });

  it("falls back to anonymous when fetch throws", async () => {
    globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("get-session")) {
        throw new Error("network failure");
      }
      return new Response("{}", { status: 200 });
    };

    render(
      <CodemationSessionRoot enabled={true}>
        <SessionDisplay />
      </CodemationSessionRoot>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status")).not.toHaveTextContent("loading");
    });
    expect(screen.getByTestId("status")).toHaveTextContent("anonymous");
  });

  it("transitions from anonymous to loading+authenticated when enabled flips true", async () => {
    let fetchCount = 0;
    globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("get-session")) {
        fetchCount++;
        return new Response(
          JSON.stringify({
            session: { id: "sess-2", userId: "user-99" },
            user: { id: "user-99", email: "bob@example.com", name: "Bob" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("{}", { status: 200 });
    };

    const { rerender } = render(
      <CodemationSessionRoot enabled={false}>
        <SessionDisplay />
      </CodemationSessionRoot>,
    );
    expect(screen.getByTestId("status")).toHaveTextContent("anonymous");

    rerender(
      <CodemationSessionRoot enabled={true}>
        <SessionDisplay />
      </CodemationSessionRoot>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    });
    expect(fetchCount).toBeGreaterThan(0);
  });

  it("transitions back to anonymous when enabled flips false", async () => {
    globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("get-session")) {
        return new Response(
          JSON.stringify({
            session: { id: "sess-3", userId: "user-1" },
            user: { id: "user-1", email: "c@example.com", name: "C" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("{}", { status: 200 });
    };

    const { rerender } = render(
      <CodemationSessionRoot enabled={true}>
        <SessionDisplay />
      </CodemationSessionRoot>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    });

    rerender(
      <CodemationSessionRoot enabled={false}>
        <SessionDisplay />
      </CodemationSessionRoot>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("anonymous");
    });
  });

  it("falls back to anonymous when get-session returns an error response (error branch in unwrapBetterFetchResult)", async () => {
    // Better Auth wraps non-ok responses as { data: null, error: { status, message } }.
    // This hits the "error in record && error !== null" branch (line 98).
    globalThis.fetch = async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("get-session")) {
        return new Response(JSON.stringify({ message: "Unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("{}", { status: 200 });
    };

    render(
      <CodemationSessionRoot enabled={true}>
        <SessionDisplay />
      </CodemationSessionRoot>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status")).not.toHaveTextContent("loading");
    });
    expect(screen.getByTestId("status")).toHaveTextContent("anonymous");
  });
});
