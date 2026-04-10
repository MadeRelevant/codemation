import type { NodeExecutionContext } from "@codemation/core";
import {
  DefaultExecutionBinaryService,
  InMemoryBinaryStorage,
  InMemoryRunDataFactory,
} from "@codemation/core/bootstrap";
import { HttpRequest, HttpRequestNode } from "@codemation/core-nodes";
import assert from "node:assert/strict";
import { test } from "vitest";

import { runPerItemLikeEngine } from "./engineTestHelpers.ts";

class HttpRequestNodeTestContextFactory {
  static create(config: HttpRequest<any>): NodeExecutionContext<HttpRequest<any>> {
    const binary = new DefaultExecutionBinaryService(
      new InMemoryBinaryStorage(),
      "wf_http_request",
      "run_http_request",
      () => new Date("2026-03-17T12:00:00.000Z"),
    );
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
  const outputs = await runPerItemLikeEngine(
    new HttpRequestNode(),
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
  const json = item.json as { status: number; bodyBinaryName?: string };
  assert.equal(item.binary?.body?.mimeType, "image/png");
  assert.equal(item.binary?.body?.previewKind, "image");
  assert.equal(json.status, 200);
  assert.equal(json.bodyBinaryName, "body");
});

test("HttpRequestNode keeps text responses JSON-only in auto mode", async () => {
  const config = new HttpRequest("Fetch text");
  const outputs = await runPerItemLikeEngine(
    new HttpRequestNode(),
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
  const json = item.json as { mimeType: string; bodyBinaryName?: string };
  assert.equal(item.binary, undefined);
  assert.equal(json.mimeType, "text/plain");
  assert.equal(json.bodyBinaryName, undefined);
});

test("HttpRequestNode stores pdf and text bodies as download attachments in always mode", async () => {
  const config = new HttpRequest("Fetch documents", { downloadMode: "always" });
  const outputs = await runPerItemLikeEngine(
    new HttpRequestNode(),
    [
      {
        json: {
          url: "data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrp/Og0MTGCjEgMCBvYmoKPDw+PgplbmRvYmoKdHJhaWxlcgo8PD4+CiUlRU9G",
        },
      },
      {
        json: {
          url: "data:text/plain;charset=utf-8,Codemation%20binary%20attachment%20demo",
        },
      },
    ],
    HttpRequestNodeTestContextFactory.create(config),
  );

  const pdfItem = outputs.main?.[0];
  const textItem = outputs.main?.[1];
  assert.ok(pdfItem);
  assert.ok(textItem);

  const pdfJson = pdfItem.json as { mimeType: string; bodyBinaryName?: string };
  const textJson = textItem.json as { mimeType: string; bodyBinaryName?: string };

  assert.equal(pdfItem.binary?.body?.mimeType, "application/pdf");
  assert.equal(pdfItem.binary?.body?.previewKind, "download");
  assert.equal(pdfJson.mimeType, "application/pdf");
  assert.equal(pdfJson.bodyBinaryName, "body");

  assert.equal(textItem.binary?.body?.mimeType, "text/plain");
  assert.equal(textItem.binary?.body?.previewKind, "download");
  assert.equal(textJson.mimeType, "text/plain");
  assert.equal(textJson.bodyBinaryName, "body");
});

test("HttpRequestNode output replaces the item JSON and does not pass through input fields", async () => {
  const config = new HttpRequest("Fetch", { urlField: "profileUrl" });
  const outputs = await runPerItemLikeEngine(
    new HttpRequestNode(),
    [
      {
        json: {
          profileUrl: "data:text/plain,hello",
          customerId: "cus_9",
          extra: { nested: true },
        },
      },
    ],
    HttpRequestNodeTestContextFactory.create(config),
  );

  const item = outputs.main?.[0];
  assert.ok(item);
  const json = item.json as Record<string, unknown>;
  assert.equal("customerId" in json, false);
  assert.equal("extra" in json, false);
  assert.equal(json.status, 200);
  assert.equal(typeof json.url, "string");
});
