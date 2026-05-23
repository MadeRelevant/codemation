import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CodemationRuntimeBootstrapClient } from "../../src/bootstrap/CodemationRuntimeBootstrapClient";

describe("CodemationRuntimeBootstrapClient", () => {
  const priorFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.CODEMATION_RUNTIME_DEV_URL = "http://127.0.0.1:3100";
  });

  afterEach(() => {
    globalThis.fetch = priorFetch;
    delete process.env.CODEMATION_RUNTIME_DEV_URL;
    delete process.env.AUTH_URL;
  });

  // ─── getInternalAuthBootstrap ─────────────────────────────────────────────

  it("fetches and deserializes internal auth bootstrap", async () => {
    const payload = {
      credentialsEnabled: true,
      oauthProviders: [{ id: "github", name: "GitHub" }],
      uiAuthEnabled: true,
    };
    globalThis.fetch = vi.fn(
      async () =>
        ({
          ok: true,
          text: async () => JSON.stringify(payload),
        }) as Response,
    ) as typeof fetch;

    const client = new CodemationRuntimeBootstrapClient();
    const result = await client.getInternalAuthBootstrap();
    expect(result.credentialsEnabled).toBe(true);
    expect(result.oauthProviders).toHaveLength(1);
    expect(result.oauthProviders[0]?.id).toBe("github");
  });

  it("throws when internal auth bootstrap response is not OK", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        ({
          ok: false,
          status: 502,
          text: async () => "Bad gateway",
        }) as Response,
    ) as typeof fetch;

    const client = new CodemationRuntimeBootstrapClient();
    await expect(client.getInternalAuthBootstrap()).rejects.toThrow("502");
  });

  it("throws when internal auth bootstrap response has an empty body", async () => {
    // The codec returns null for empty/whitespace bodies
    globalThis.fetch = vi.fn(
      async () =>
        ({
          ok: true,
          text: async () => "",
        }) as Response,
    ) as typeof fetch;

    const client = new CodemationRuntimeBootstrapClient();
    await expect(client.getInternalAuthBootstrap()).rejects.toThrow("invalid internal auth bootstrap payload");
  });

  it("throws with body text when response is not OK but has no body", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        ({
          ok: false,
          status: 503,
          text: async () => "",
        }) as Response,
    ) as typeof fetch;

    const client = new CodemationRuntimeBootstrapClient();
    await expect(client.getInternalAuthBootstrap()).rejects.toThrow("503");
  });

  // ─── getPublicFrontendBootstrap ───────────────────────────────────────────

  it("fetches and deserializes public frontend bootstrap", async () => {
    const payload = {
      productName: "Codemation",
      logoUrl: null,
      credentialsEnabled: true,
      oauthProviders: [],
    };
    globalThis.fetch = vi.fn(
      async () =>
        ({
          ok: true,
          text: async () => JSON.stringify(payload),
        }) as Response,
    ) as typeof fetch;

    const client = new CodemationRuntimeBootstrapClient();
    const result = await client.getPublicFrontendBootstrap();
    expect(result.productName).toBe("Codemation");
    expect(result.credentialsEnabled).toBe(true);
  });

  it("throws when public frontend bootstrap response is not OK", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        ({
          ok: false,
          status: 503,
          text: async () => "Service unavailable",
        }) as Response,
    ) as typeof fetch;

    const client = new CodemationRuntimeBootstrapClient();
    await expect(client.getPublicFrontendBootstrap()).rejects.toThrow("503");
  });

  it("throws when public frontend bootstrap body is empty", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        ({
          ok: true,
          text: async () => "",
        }) as Response,
    ) as typeof fetch;

    const client = new CodemationRuntimeBootstrapClient();
    await expect(client.getPublicFrontendBootstrap()).rejects.toThrow("invalid public frontend bootstrap payload");
  });
});
