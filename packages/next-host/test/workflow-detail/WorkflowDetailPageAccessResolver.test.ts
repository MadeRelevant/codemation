import { describe, expect, it } from "vitest";

import { WorkflowDetailPageApiAdapter } from "../../src/features/workflows/server/WorkflowDetailPageApiAdapter";
import { WorkflowDetailPageAccessResolver } from "../../src/features/workflows/server/WorkflowDetailPageAccessResolver";
import type { WorkflowDetailPageApiPort } from "../../src/features/workflows/server/WorkflowDetailPageApiPort.types";

class StubWorkflowDetailPageApi implements WorkflowDetailPageApiPort {
  constructor(private readonly status: number) {}

  async fetchWorkflowStatus(): Promise<number> {
    return this.status;
  }
}

describe("WorkflowDetailPageAccessResolver", () => {
  it("forwards the workflow request to the next host API with the caller cookies", async () => {
    const originalFetch = globalThis.fetch;
    const originalRuntimeDevUrl = process.env.CODEMATION_RUNTIME_DEV_URL;
    const seen: Array<{ cookie: string | null; pathname: string; origin: string }> = [];
    process.env.CODEMATION_RUNTIME_DEV_URL = "http://127.0.0.1:4010";
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      seen.push({
        cookie: request.headers.get("cookie"),
        pathname: url.pathname,
        origin: url.origin,
      });
      return new Response(null, { status: 204 });
    };

    try {
      const adapter = new WorkflowDetailPageApiAdapter();
      await expect(
        adapter.fetchWorkflowStatus({
          workflowId: "wf.present",
          cookieHeader: "session=abc",
        }),
      ).resolves.toBe(204);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalRuntimeDevUrl === undefined) {
        delete process.env.CODEMATION_RUNTIME_DEV_URL;
      } else {
        process.env.CODEMATION_RUNTIME_DEV_URL = originalRuntimeDevUrl;
      }
    }

    expect(seen).toEqual([
      {
        cookie: "session=abc",
        pathname: "/api/workflows/wf.present",
        origin: "http://127.0.0.1:4010",
      },
    ]);
  });

  it("routes unknown workflows to the not-found page", async () => {
    const resolver = new WorkflowDetailPageAccessResolver(new StubWorkflowDetailPageApi(404));

    await expect(
      resolver.resolve({
        workflowId: "wf.missing",
        cookieHeader: null,
      }),
    ).resolves.toBe("not-found");
  });

  it("keeps rendering when the workflow request does not return 404", async () => {
    const resolver = new WorkflowDetailPageAccessResolver(new StubWorkflowDetailPageApi(200));

    await expect(
      resolver.resolve({
        workflowId: "wf.present",
        cookieHeader: "session=abc",
      }),
    ).resolves.toBe("render");
  });
});
