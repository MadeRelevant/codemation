import { HttpRequestExecutor } from "../src/http/HttpRequestExecutor";
import { HttpBodyBuilder } from "../src/http/HttpBodyBuilder";
import { HttpUrlBuilder } from "../src/http/HttpUrlBuilder";
import type { HttpRequestSpec } from "../src/http/httpRequest.types";
import type { NodeExecutionContext } from "@codemation/core";
import type { RunnableNodeConfig } from "@codemation/core";
import assert from "node:assert/strict";
import { describe, test } from "vitest";

/** Minimal fake ctx with no binary operations needed for executor tests. */
function makeFakeCtx(): NodeExecutionContext<RunnableNodeConfig<unknown, unknown>> {
  return {
    runId: "run_test",
    workflowId: "wf_test",
    nodeId: "node_exec",
    activationId: "act_exec",
    parent: undefined,
    now: () => new Date(),
    config: {} as RunnableNodeConfig<unknown, unknown>,
    data: {} as NodeExecutionContext<RunnableNodeConfig<unknown, unknown>>["data"],
    binary: {
      openReadStream: async () => undefined,
      attach: async () => { throw new Error("not implemented"); },
      withAttachment: () => { throw new Error("not implemented"); },
      forNode: () => { throw new Error("not implemented"); },
    } as unknown as NodeExecutionContext<RunnableNodeConfig<unknown, unknown>>["binary"],
  };
}

function makeFetch(
  opts: Readonly<{
    status?: number;
    statusText?: string;
    contentType?: string;
    body?: string;
  }> = {},
): typeof globalThis.fetch {
  const { status = 200, statusText = "OK", contentType = "application/json", body = "{}" } = opts;
  return async (_url: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(body, {
      status,
      statusText,
      headers: { "content-type": contentType },
    });
  };
}

describe("HttpRequestExecutor", () => {
  test("returns basic GET result with JSON body", async () => {
    const ctx = makeFakeCtx();
    const executor = new HttpRequestExecutor(
      makeFetch({ body: '{"hello":"world"}', contentType: "application/json" }), new HttpBodyBuilder(), new HttpUrlBuilder());
    const spec: HttpRequestSpec = {
      url: "https://api.example.com/data",
      method: "GET",
      ctx: ctx as unknown as HttpRequestSpec["ctx"],
    };
    const result = await executor.execute(spec, { json: {} });
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.mimeType, "application/json");
    assert.deepEqual(result.json, { hello: "world" });
  });

  test("merges credential headers into request", async () => {
    const ctx = makeFakeCtx();

    let capturedInit: RequestInit | undefined;
    const fakeFetch: typeof globalThis.fetch = async (_url, init) => {
      capturedInit = init;
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    };

    const executor = new HttpRequestExecutor(fakeFetch, new HttpBodyBuilder(), new HttpUrlBuilder());
    const spec: HttpRequestSpec = {
      url: "https://api.example.com/data",
      method: "GET",
      credential: {
        applyToRequest: () => ({ headers: { authorization: "Bearer test-token" } }),
      },
      ctx: ctx as unknown as HttpRequestSpec["ctx"],
    };

    await executor.execute(spec, { json: {} });

    const headers = capturedInit?.headers as Record<string, string>;
    assert.equal(headers["authorization"], "Bearer test-token");
  });

  test("merges credential query params into URL", async () => {
    const ctx = makeFakeCtx();

    let capturedUrl: string | undefined;
    const fakeFetch: typeof globalThis.fetch = async (url, _init) => {
      capturedUrl = typeof url === "string" ? url : url instanceof URL ? url.toString() : String(url);
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    };

    const executor = new HttpRequestExecutor(fakeFetch, new HttpBodyBuilder(), new HttpUrlBuilder());
    const spec: HttpRequestSpec = {
      url: "https://api.example.com/data",
      method: "GET",
      credential: {
        applyToRequest: () => ({ query: { apiKey: "secret-key" } }),
      },
      ctx: ctx as unknown as HttpRequestSpec["ctx"],
    };

    await executor.execute(spec, { json: {} });

    assert.ok(capturedUrl);
    const url = new URL(capturedUrl);
    assert.equal(url.searchParams.get("apiKey"), "secret-key");
  });

  test("sends JSON body with correct content-type", async () => {
    const ctx = makeFakeCtx();

    let capturedInit: RequestInit | undefined;
    const fakeFetch: typeof globalThis.fetch = async (_url, init) => {
      capturedInit = init;
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    };

    const executor = new HttpRequestExecutor(fakeFetch, new HttpBodyBuilder(), new HttpUrlBuilder());
    const spec: HttpRequestSpec = {
      url: "https://api.example.com/data",
      method: "POST",
      body: { kind: "json", data: { name: "test" } },
      ctx: ctx as unknown as HttpRequestSpec["ctx"],
    };

    await executor.execute(spec, { json: {} });

    assert.ok(capturedInit);
    const headers = capturedInit.headers as Record<string, string>;
    assert.equal(headers["content-type"], "application/json");
    assert.equal(capturedInit.body, JSON.stringify({ name: "test" }));
  });

  test("returns non-ok result for 4xx status", async () => {
    const ctx = makeFakeCtx();
    const executor = new HttpRequestExecutor(
      makeFetch({ status: 404, statusText: "Not Found", body: '{"error":"not found"}', contentType: "application/json" }), new HttpBodyBuilder(), new HttpUrlBuilder());
    const spec: HttpRequestSpec = {
      url: "https://api.example.com/missing",
      method: "GET",
      ctx: ctx as unknown as HttpRequestSpec["ctx"],
    };
    const result = await executor.execute(spec, { json: {} });
    assert.equal(result.ok, false);
    assert.equal(result.status, 404);
    assert.deepEqual(result.json, { error: "not found" });
  });

  test("marks bodyBinaryName for auto-download mode with image content-type", async () => {
    const ctx = makeFakeCtx();
    const executor = new HttpRequestExecutor(
      makeFetch({ contentType: "image/png", body: "binary-data" }), new HttpBodyBuilder(), new HttpUrlBuilder());
    const spec: HttpRequestSpec = {
      url: "https://example.com/image.png",
      method: "GET",
      download: { mode: "auto", binaryName: "image" },
      ctx: ctx as unknown as HttpRequestSpec["ctx"],
    };
    const result = await executor.execute(spec, { json: {} });
    assert.equal(result.bodyBinaryName, "image");
  });

  test("does not mark bodyBinaryName for never download mode", async () => {
    const ctx = makeFakeCtx();
    const executor = new HttpRequestExecutor(
      makeFetch({ contentType: "image/png", body: "binary-data" }), new HttpBodyBuilder(), new HttpUrlBuilder());
    const spec: HttpRequestSpec = {
      url: "https://example.com/image.png",
      method: "GET",
      download: { mode: "never", binaryName: "image" },
      ctx: ctx as unknown as HttpRequestSpec["ctx"],
    };
    const result = await executor.execute(spec, { json: {} });
    assert.equal(result.bodyBinaryName, undefined);
  });
});
