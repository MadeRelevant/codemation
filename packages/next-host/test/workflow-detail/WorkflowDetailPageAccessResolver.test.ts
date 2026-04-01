import { describe, expect, it } from "vitest";

import { WorkflowDetailPageApiAdapter } from "../../src/features/workflows/server/WorkflowDetailPageApiAdapter";
import { WorkflowDetailPageAccessResolver } from "../../src/features/workflows/server/WorkflowDetailPageAccessResolver";
import type { WorkflowDetailPageApiPort } from "../../src/features/workflows/server/WorkflowDetailPageApiPort.types";
import { CodemationNextHost } from "../../src/server/CodemationNextHost";

class StubWorkflowDetailPageApi implements WorkflowDetailPageApiPort {
  constructor(private readonly status: number) {}

  async fetchWorkflowStatus(): Promise<number> {
    return this.status;
  }
}

describe("WorkflowDetailPageAccessResolver", () => {
  it("forwards the workflow request to the next host API with the caller cookies", async () => {
    const shared = CodemationNextHost.shared;
    const originalFetchApi = shared.fetchApi.bind(shared);
    const seen: Array<{ cookie: string | null; pathname: string }> = [];
    shared.fetchApi = async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      seen.push({
        cookie: request.headers.get("cookie"),
        pathname: url.pathname,
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
      shared.fetchApi = originalFetchApi;
    }

    expect(seen).toEqual([
      {
        cookie: "session=abc",
        pathname: "/api/workflows/wf.present",
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
