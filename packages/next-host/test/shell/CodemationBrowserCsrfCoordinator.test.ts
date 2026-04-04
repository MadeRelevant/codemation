// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { CodemationBrowserCsrfCoordinator } from "../../src/shell/CodemationBrowserCsrfCoordinator";

afterEach(() => {
  document.cookie = "codemation.csrf-token=; Max-Age=0; path=/";
  document.cookie = "__Host-codemation.csrf-token=; Max-Age=0; path=/";
});

describe("CodemationBrowserCsrfCoordinator", () => {
  it("reads codemation.csrf-token from document.cookie", () => {
    document.cookie = "codemation.csrf-token=from-cookie; path=/";
    const coordinator = new CodemationBrowserCsrfCoordinator("/api/auth/session");
    expect(coordinator.readTokenFromDocumentCookie()).toBe("from-cookie");
  });

  it("ensureToken calls the session URL when no CSRF cookie is present", async () => {
    let probeUrl = "";
    const fetchImpl: typeof fetch = async (input) => {
      probeUrl = typeof input === "string" ? input : input.toString();
      document.cookie = "codemation.csrf-token=issued; path=/";
      return new Response(null, { status: 204 });
    };
    const coordinator = new CodemationBrowserCsrfCoordinator("/api/auth/session");
    const token = await coordinator.ensureToken(fetchImpl);
    expect(probeUrl).toBe("/api/auth/session");
    expect(token).toBe("issued");
  });

  it("ensureToken skips the session probe when a token already exists", async () => {
    document.cookie = "codemation.csrf-token=existing; path=/";
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return new Response(null, { status: 204 });
    };
    const coordinator = new CodemationBrowserCsrfCoordinator("/api/auth/session");
    const token = await coordinator.ensureToken(fetchImpl);
    expect(token).toBe("existing");
    expect(calls).toBe(0);
  });
});
