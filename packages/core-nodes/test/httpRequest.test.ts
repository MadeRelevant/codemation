import type { Item, NodeExecutionContext } from "@codemation/core";
import {
  DefaultExecutionBinaryService,
  InMemoryBinaryStorage,
  InMemoryRunDataFactory,
} from "@codemation/core/bootstrap";
import { HttpRequest, HttpRequestNode, bearerTokenCredentialType } from "@codemation/core-nodes";
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

// ---------------------------------------------------------------------------
// responseFormat: "binary" tests
// ---------------------------------------------------------------------------

test("responseFormat binary: PDF bytes are stored in ctx.binary with correct slot, mimeType; output json has binarySlot not body/text", async () => {
  // Minimal PDF bytes — enough to check the binary round-trip.
  const pdfBase64 = "JVBERi0xLjQKJcTl8uXrp/Og0MTGCjEgMCBvYmoKPDw+PgplbmRvYmoKdHJhaWxlcgo8PD4+CiUlRU9G";
  const config = new HttpRequest("Fetch PDF", {
    responseFormat: "binary",
    responseBinarySlot: "resume",
  });
  const outputs = await runPerItemLikeEngine(
    new HttpRequestNode(),
    [
      {
        json: {
          url: `data:application/pdf;base64,${pdfBase64}`,
        },
      },
    ],
    HttpRequestNodeTestContextFactory.create(config),
  );

  const item = outputs.main?.[0];
  assert.ok(item, "expected an output item");

  const json = item.json as Record<string, unknown>;
  // Output json must have binarySlot but NOT body/text/mimeType fields
  assert.equal(json["binarySlot"], "resume", "binarySlot should be the configured slot name");
  assert.equal(json["contentType"], "application/pdf", "contentType should be the response MIME");
  assert.equal("body" in json, false, "json must not contain raw body bytes");
  assert.equal("text" in json, false, "json must not contain raw text");
  assert.ok(typeof json["size"] === "number" && (json["size"] as number) > 0, "size should be positive");
  assert.equal(json["status"], 200);

  // Binary slot on the item
  assert.ok(item.binary?.["resume"], "binary slot 'resume' should be attached");
  assert.equal(item.binary?.["resume"]?.mimeType, "application/pdf");
  assert.ok((item.binary?.["resume"]?.size ?? 0) > 0, "binary slot should have non-zero size");
});

test("responseFormat binary: filename comes from Content-Disposition header when present (overrides URL pathname)", async () => {
  const pdfBase64 = "JVBERi0xLjQK";

  const savedFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(
        // eslint-disable-next-line codemation/no-buffer-everything -- 12-byte test fixture; bounded literal, not a runtime payload.
        Buffer.from(pdfBase64, "base64"),
        {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-disposition": 'attachment; filename="quarterly-report.pdf"',
          },
        },
      );

    const config = new HttpRequest("Fetch PDF", { responseFormat: "binary" });
    const outputs = await runPerItemLikeEngine(
      new HttpRequestNode(),
      [{ json: { url: "https://example.com/d?id=42" } }],
      HttpRequestNodeTestContextFactory.create(config),
    );

    const item = outputs.main?.[0];
    assert.ok(item);
    const json = item.json as Record<string, unknown>;
    // filename comes from Content-Disposition, not the URL's path tail.
    assert.equal(json["filename"], "quarterly-report.pdf");
    assert.equal(item.binary?.response?.filename, "quarterly-report.pdf");
  } finally {
    globalThis.fetch = savedFetch;
  }
});

test("responseFormat binary: filename falls back to URL pathname tail when Content-Disposition is absent", async () => {
  const pdfBase64 = "JVBERi0xLjQK";

  const savedFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(
        // eslint-disable-next-line codemation/no-buffer-everything -- 12-byte test fixture; bounded literal, not a runtime payload.
        Buffer.from(pdfBase64, "base64"),
        {
          status: 200,
          headers: { "content-type": "application/pdf" },
        },
      );

    const config = new HttpRequest("Fetch PDF", { responseFormat: "binary" });
    const outputs = await runPerItemLikeEngine(
      new HttpRequestNode(),
      [{ json: { url: "https://example.com/files/spec.pdf" } }],
      HttpRequestNodeTestContextFactory.create(config),
    );

    const item = outputs.main?.[0];
    assert.ok(item);
    const json = item.json as Record<string, unknown>;
    assert.equal(json["filename"], "spec.pdf");
  } finally {
    globalThis.fetch = savedFetch;
  }
});

test("responseFormat binary: default slot name is 'response' when responseBinarySlot not set", async () => {
  const config = new HttpRequest("Fetch image", { responseFormat: "binary" });
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
  const json = item.json as Record<string, unknown>;
  assert.equal(json["binarySlot"], "response");
  assert.ok(item.binary?.["response"], "binary slot 'response' should be attached by default");
});

test("responseFormat binary: throws before allocating when Content-Length exceeds responseSizeCapBytes", async () => {
  // Mock fetch to return a response with a large Content-Length header
  const savedFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url: string | URL | Request, _init?: RequestInit) => {
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          "content-type": "application/octet-stream",
          "content-length": "5000",
        },
      });
    };

    const config = new HttpRequest("Fetch large file", {
      responseFormat: "binary",
      responseSizeCapBytes: 100,
    });
    const ctx = HttpRequestNodeTestContextFactory.create(config);

    await assert.rejects(
      () => runPerItemLikeEngine(new HttpRequestNode(), [{ json: { url: "https://example.com/large-file.bin" } }], ctx),
      (err: Error) => {
        assert.ok(err.message.includes("responseSizeCapBytes"), `Expected size cap message, got: ${err.message}`);
        return true;
      },
    );
  } finally {
    globalThis.fetch = savedFetch;
  }
});

// ---------------------------------------------------------------------------
// bodyFormat: "binary" tests
// ---------------------------------------------------------------------------

test("bodyFormat binary: outgoing fetch uses bytes from binary slot and Content-Type from attachment mimeType", async () => {
  const pdfBytes = Buffer.from("fake-pdf-content");

  // First, attach the PDF to an item using the binary service so we have a real BinaryAttachment.
  const binaryStorage = new InMemoryBinaryStorage();
  const binaryService = new DefaultExecutionBinaryService(
    binaryStorage,
    "wf_http_request",
    "run_http_request",
    () => new Date("2026-03-17T12:00:00.000Z"),
  );
  const nodeService = binaryService.forNode({ nodeId: "node_http_request", activationId: "act_http_request" });
  const attachment = await nodeService.attach({
    name: "pdf",
    body: pdfBytes,
    mimeType: "application/pdf",
    filename: "test.pdf",
  });
  const inputItem: Item = nodeService.withAttachment({ json: {} }, "pdf", attachment);

  let capturedBody: BodyInit | null | undefined;
  let capturedContentType: string | undefined;

  const savedFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as BodyInit;
      capturedContentType = (init?.headers as Record<string, string>)?.["content-type"];
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const config = new HttpRequest("Upload PDF", {
      method: "POST",
      url: "https://example.com/upload",
      body: { kind: "binary", slot: "pdf" },
    });
    const ctx: NodeExecutionContext<HttpRequest<any>> = {
      runId: "run_http_request",
      workflowId: "wf_http_request",
      parent: undefined,
      now: () => new Date("2026-03-17T12:00:00.000Z"),
      data: new InMemoryRunDataFactory().create(),
      nodeId: "node_http_request",
      activationId: "act_http_request",
      config,
      binary: nodeService,
    };

    const outputs = await runPerItemLikeEngine(new HttpRequestNode(), [inputItem], ctx);

    const outputItem = outputs.main?.[0];
    assert.ok(outputItem, "expected an output item");

    // The body is streamed straight from the binary store — not buffered into
    // memory — so fetch receives a ReadableStream (Web). Reading it should
    // produce the original bytes.
    assert.ok(
      capturedBody !== undefined &&
        capturedBody !== null &&
        typeof (capturedBody as ReadableStream).getReader === "function",
      "fetch body should be a ReadableStream (streaming, not buffered)",
    );
    const reader = (capturedBody as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    assert.deepEqual(Buffer.from(merged), pdfBytes, "streamed body should match the attachment bytes");
    assert.equal(capturedContentType, "application/pdf", "Content-Type should come from attachment mimeType");
  } finally {
    globalThis.fetch = savedFetch;
  }
});

test("bodyFormat binary: explicit Content-Type header wins over attachment mimeType", async () => {
  const pdfBytes = Buffer.from("fake-pdf-content");

  const binaryStorage = new InMemoryBinaryStorage();
  const binaryService = new DefaultExecutionBinaryService(
    binaryStorage,
    "wf_http_request",
    "run_http_request",
    () => new Date("2026-03-17T12:00:00.000Z"),
  );
  const nodeService = binaryService.forNode({ nodeId: "node_http_request", activationId: "act_http_request" });
  const attachment = await nodeService.attach({
    name: "file",
    body: pdfBytes,
    mimeType: "application/pdf",
  });
  const inputItem: Item = nodeService.withAttachment({ json: {} }, "file", attachment);

  let capturedContentType: string | undefined;

  const savedFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedContentType = (init?.headers as Record<string, string>)?.["content-type"];
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const config = new HttpRequest("Upload with custom type", {
      method: "POST",
      url: "https://example.com/upload",
      headers: { "content-type": "application/x-custom" },
      body: { kind: "binary", slot: "file" },
    });
    const ctx: NodeExecutionContext<HttpRequest<any>> = {
      runId: "run_http_request",
      workflowId: "wf_http_request",
      parent: undefined,
      now: () => new Date("2026-03-17T12:00:00.000Z"),
      data: new InMemoryRunDataFactory().create(),
      nodeId: "node_http_request",
      activationId: "act_http_request",
      config,
      binary: nodeService,
    };

    await runPerItemLikeEngine(new HttpRequestNode(), [inputItem], ctx);

    assert.equal(
      capturedContentType,
      "application/x-custom",
      "Explicit Content-Type header should win over attachment mimeType",
    );
  } finally {
    globalThis.fetch = savedFetch;
  }
});

test("HttpRequest exposes the id arg when provided", () => {
  const config = new HttpRequest("Named node", { id: "my-node-id" });
  assert.equal(config.id, "my-node-id");
});

test("HttpRequest.getCredentialRequirements returns empty array when no credentialSlot", () => {
  const config = new HttpRequest("No auth");
  assert.deepEqual(config.getCredentialRequirements(), []);
});

test("HttpRequest.getCredentialRequirements object form narrows to caller-supplied acceptedTypes", () => {
  const config = new HttpRequest("Bearer only", {
    credentialSlot: {
      name: "auth",
      acceptedTypes: [bearerTokenCredentialType],
    },
  });
  const reqs = config.getCredentialRequirements();
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0]?.slotKey, "auth");
  assert.deepEqual(reqs[0]?.acceptedTypes, [bearerTokenCredentialType.definition.typeId]);
});

test("HttpRequest.getCredentialRequirements object form falls back to all defaults when acceptedTypes empty", () => {
  const config = new HttpRequest("Open auth", {
    credentialSlot: { name: "open", acceptedTypes: [] },
  });
  const reqs = config.getCredentialRequirements();
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0]?.slotKey, "open");
  // Falls back to the full set of four default credential type IDs
  assert.equal((reqs[0]?.acceptedTypes as string[]).length, 4);
});
