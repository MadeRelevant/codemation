import { describe, expect, it } from "vitest";
import { createWorkflowCanvasApiClient } from "@codemation/canvas";
import type { WorkflowCanvasApiClientOptions } from "@codemation/canvas";

/**
 * Tests for createWorkflowCanvasApiClient.
 * Uses a fake fetch — no vi.mock, no vi.stubGlobal (ESLint forbids them).
 * globals are saved/restored in try/finally or via beforeEach/afterEach as
 * needed; these tests inject fetch directly via options.
 */

type FakeRequest = { url: string; init: RequestInit };

function makeFakeFetch(responses: ReadonlyArray<{ status: number; body: unknown }>) {
  let call = 0;
  const calls: FakeRequest[] = [];
  const fakeFetch: typeof globalThis.fetch = async (input, init = {}) => {
    calls.push({ url: String(input), init });
    const resp = responses[call] ?? responses[responses.length - 1]!;
    call++;
    const bodyText = JSON.stringify(resp.body);
    return {
      ok: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      json: async () => resp.body,
      text: async () => bodyText,
    } as Response;
  };
  return { fakeFetch, calls };
}

function makeClient(fetchImpl: typeof globalThis.fetch, override?: Partial<WorkflowCanvasApiClientOptions>) {
  return createWorkflowCanvasApiClient({
    apiBase: "https://ws.example.com",
    getToken: () => "test-jwt",
    fetch: fetchImpl,
    ...override,
  });
}

describe("createWorkflowCanvasApiClient", () => {
  describe("Authorization header", () => {
    it("sends Bearer token when getToken returns a string", async () => {
      const { fakeFetch, calls } = makeFakeFetch([{ status: 200, body: [] }]);
      const client = makeClient(fakeFetch);
      await client.fetchWorkflows();
      const headers = calls[0]!.init.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer test-jwt");
    });

    it("does NOT send Authorization header when getToken returns null", async () => {
      const { fakeFetch, calls } = makeFakeFetch([{ status: 200, body: [] }]);
      const client = makeClient(fakeFetch, { getToken: () => null });
      await client.fetchWorkflows();
      const headers = (calls[0]!.init.headers ?? {}) as Record<string, string>;
      expect(headers["Authorization"]).toBeUndefined();
    });

    it("uses same-origin credentials when getToken returns null", async () => {
      const { fakeFetch, calls } = makeFakeFetch([{ status: 200, body: [] }]);
      const client = makeClient(fakeFetch, { getToken: () => null });
      await client.fetchWorkflows();
      expect(calls[0]!.init.credentials).toBe("same-origin");
    });

    it("uses same-origin credentials when getToken returns a token", async () => {
      // Always "same-origin" — for a relative/same-origin apiBase the browser
      // sends cookies (so an upstream proxy can pass an auth gate), and drops
      // them cross-origin. Previously this was "omit" when a Bearer token was
      // set, which broke same-origin proxy deployments.
      const { fakeFetch, calls } = makeFakeFetch([{ status: 200, body: [] }]);
      const client = makeClient(fakeFetch);
      await client.fetchWorkflows();
      expect(calls[0]!.init.credentials).toBe("same-origin");
    });
  });

  describe("401 retry-once-with-refresh", () => {
    it("retries with a refreshed token on 401", async () => {
      const { fakeFetch, calls } = makeFakeFetch([
        { status: 401, body: { error: "Unauthorized" } },
        { status: 200, body: [] },
      ]);
      let refreshCalled = false;
      const client = createWorkflowCanvasApiClient({
        apiBase: "https://ws.example.com",
        getToken: (opts) => {
          if (opts?.forceRefresh) {
            refreshCalled = true;
            return "refreshed-jwt";
          }
          return "original-jwt";
        },
        fetch: fakeFetch,
      });
      const result = await client.fetchWorkflows();
      expect(refreshCalled).toBe(true);
      expect(calls).toHaveLength(2);
      const secondHeaders = calls[1]!.init.headers as Record<string, string>;
      expect(secondHeaders["Authorization"]).toBe("Bearer refreshed-jwt");
      expect(result).toEqual([]);
    });

    it("throws CodemationApiHttpError after second 401 (no infinite retry)", async () => {
      const { fakeFetch } = makeFakeFetch([
        { status: 401, body: { error: "Unauthorized" } },
        { status: 401, body: { error: "Still Unauthorized" } },
      ]);
      const client = createWorkflowCanvasApiClient({
        apiBase: "https://ws.example.com",
        getToken: () => "jwt",
        fetch: fakeFetch,
      });
      await expect(client.fetchWorkflows()).rejects.toThrow("HTTP 401");
    });

    it("does not retry on 403", async () => {
      const { fakeFetch, calls } = makeFakeFetch([{ status: 403, body: { error: "Forbidden" } }]);
      const client = makeClient(fakeFetch);
      await expect(client.fetchWorkflows()).rejects.toThrow("HTTP 403");
      expect(calls).toHaveLength(1);
    });
  });

  describe("URL construction", () => {
    it("builds correct URL from apiBase", async () => {
      const { fakeFetch, calls } = makeFakeFetch([{ status: 200, body: [] }]);
      const client = makeClient(fakeFetch);
      await client.fetchWorkflows();
      expect(calls[0]!.url).toBe("https://ws.example.com/api/workflows");
    });

    it("uses same-origin path when apiBase is empty string", async () => {
      const { fakeFetch, calls } = makeFakeFetch([{ status: 200, body: [] }]);
      const client = makeClient(fakeFetch, { apiBase: "", getToken: () => null });
      await client.fetchWorkflows();
      expect(calls[0]!.url).toBe("/api/workflows");
    });

    it("encodes workflowId in URL", async () => {
      const { fakeFetch, calls } = makeFakeFetch([{ status: 200, body: {} }]);
      const client = makeClient(fakeFetch);
      await client.fetchWorkflow("my workflow/id");
      expect(calls[0]!.url).toContain(encodeURIComponent("my workflow/id"));
    });
  });

  describe("fetchWorkflowRuns", () => {
    it("calls the correct endpoint", async () => {
      const { fakeFetch, calls } = makeFakeFetch([{ status: 200, body: [] }]);
      const client = makeClient(fakeFetch);
      await client.fetchWorkflowRuns("wf_1");
      expect(calls[0]!.url).toContain("wf_1");
      expect(calls[0]!.url).toContain("/runs");
    });
  });

  describe("postRunWorkflow", () => {
    it("posts to the runs endpoint with workflowId in body", async () => {
      const { fakeFetch, calls } = makeFakeFetch([{ status: 200, body: { runId: "r1" } }]);
      const client = makeClient(fakeFetch);
      await client.postRunWorkflow("wf_1", {});
      expect(calls[0]!.url).toContain("/api/runs");
      expect(calls[0]!.init.method).toBe("POST");
      const body = JSON.parse(calls[0]!.init.body as string) as Record<string, unknown>;
      expect(body.workflowId).toBe("wf_1");
    });
  });
});
