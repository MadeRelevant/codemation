import assert from "node:assert/strict";
import test from "node:test";
import type { NodeExecutionContext } from "@codemation/core";
import { DefaultExecutionBinaryService, InMemoryBinaryStorage, InMemoryRunDataFactory } from "@codemation/core";
import { HttpRequest, HttpRequestNode } from "@codemation/core-nodes";

class HttpRequestNodeTestContextFactory {
  static create(config: HttpRequest<any>): NodeExecutionContext<HttpRequest<any>> {
    const binary = new DefaultExecutionBinaryService(new InMemoryBinaryStorage(), "wf_http_request", "run_http_request", () => new Date("2026-03-17T12:00:00.000Z"));
    return {
      runId: "run_http_request",
      workflowId: "wf_http_request",
      parent: undefined,
      now: () => new Date("2026-03-17T12:00:00.000Z"),
      data: new InMemoryRunDataFactory().create(),
      nodeId: "node_http_request",
      activationId: "act_http_request",
      config,
      binary: binary.forNode({ nodeId: "node_http_request", activationId: "act_http_request" }),
    };
  }
}

test("HttpRequestNode downloads media responses into binary attachments", async () => {
  const config = new HttpRequest("Fetch image", { downloadMode: "always" });
  const outputs = await new HttpRequestNode().execute(
    [
      {
        json: {
          url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Zl4kAAAAASUVORK5CYII=",
        },
      },
    ],
    HttpRequestNodeTestContextFactory.create(config),
  );

  const item = outputs.main?.[0];
  assert.ok(item);
  const json = item.json as { http: { status: number; bodyBinaryName?: string } };
  assert.equal(item.binary?.body?.mimeType, "image/png");
  assert.equal(item.binary?.body?.previewKind, "image");
  assert.equal(json.http.status, 200);
  assert.equal(json.http.bodyBinaryName, "body");
});

test("HttpRequestNode keeps text responses JSON-only in auto mode", async () => {
  const config = new HttpRequest("Fetch text");
  const outputs = await new HttpRequestNode().execute(
    [
      {
        json: {
          url: "data:text/plain,hello-world",
        },
      },
    ],
    HttpRequestNodeTestContextFactory.create(config),
  );

  const item = outputs.main?.[0];
  assert.ok(item);
  const json = item.json as { http: { mimeType: string; bodyBinaryName?: string } };
  assert.equal(item.binary, undefined);
  assert.equal(json.http.mimeType, "text/plain");
  assert.equal(json.http.bodyBinaryName, undefined);
});
