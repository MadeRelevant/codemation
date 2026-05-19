// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { WebhookInvocationMatch } from "@codemation/core";
import { RequestToWebhookItemMapper } from "../../src/infrastructure/webhooks/RequestToWebhookItemMapper";

class IdFactory {
  makeRunId(): string {
    return "run_1";
  }
  makeActivationId(): string {
    return "act_1";
  }
}

class SimpleInMemoryStorage {
  readonly driverName = "test-memory";
  private readonly values = new Map<string, Uint8Array>();

  async write(args: {
    storageKey: string;
    body: ReadableStream<Uint8Array>;
  }): Promise<{ storageKey: string; size: number; sha256: string }> {
    const reader = args.body.getReader();
    const chunks: Uint8Array[] = [];
    let done = false;
    while (!done) {
      const { value, done: isDone } = await reader.read();
      if (value) chunks.push(value);
      done = isDone;
    }
    const total = chunks.reduce((acc, c) => acc + c.length, 0);
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    this.values.set(args.storageKey, bytes);
    return { storageKey: args.storageKey, size: total, sha256: "abc" };
  }

  async openReadStream(storageKey: string): Promise<{ body: ReadableStream; size?: number } | undefined> {
    const bytes = this.values.get(storageKey);
    if (!bytes) return undefined;
    return {
      body: new ReadableStream({
        start(c) {
          c.enqueue(bytes);
          c.close();
        },
      }),
      size: bytes.byteLength,
    };
  }

  async stat(storageKey: string): Promise<{ exists: boolean }> {
    return { exists: this.values.has(storageKey) };
  }

  async delete(storageKey: string): Promise<void> {
    this.values.delete(storageKey);
  }
}

function makeMapper(): RequestToWebhookItemMapper {
  const ids = new IdFactory();
  return new RequestToWebhookItemMapper(new SimpleInMemoryStorage() as never, ids as never, ids as never);
}

function makeMatch(overrides: Partial<WebhookInvocationMatch> = {}): WebhookInvocationMatch {
  return {
    endpointPath: "/webhook/test",
    workflowId: "wf_1",
    nodeId: "node_1",
    methods: ["POST"],
    ...overrides,
  } as WebhookInvocationMatch;
}

describe("RequestToWebhookItemMapper", () => {
  it("maps a plain text body POST request", async () => {
    const mapper = makeMapper();
    const request = new Request("http://localhost/webhook/test?foo=bar", {
      method: "POST",
      body: "hello world",
    });
    const item = await mapper.map(request, makeMatch());
    expect(item.json).toMatchObject({
      method: "POST",
      url: "http://localhost/webhook/test?foo=bar",
      query: { foo: "bar" },
      body: "hello world",
    });
    expect(item.binary).toBeUndefined();
  });

  it("maps a JSON body POST request and parses it", async () => {
    const mapper = makeMapper();
    const request = new Request("http://localhost/webhook/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Alice", age: 30 }),
    });
    const item = await mapper.map(request, makeMatch());
    // body = raw parsed JSON object, json = the same value (no parseJsonBody transform)
    expect((item.json as { json: unknown }).json).toMatchObject({ name: "Alice", age: 30 });
    expect((item.json as { body: unknown }).body).toMatchObject({ name: "Alice" });
  });

  it("applies parseJsonBody transform when provided", async () => {
    const mapper = makeMapper();
    const request = new Request("http://localhost/webhook/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: { value: 42 } }),
    });
    const item = await mapper.map(
      request,
      makeMatch({
        parseJsonBody: (body) => (body as { data: { value: number } }).data,
      }),
    );
    expect((item.json as { json: unknown }).json).toMatchObject({ value: 42 });
  });

  it("maps a GET request with no body", async () => {
    const mapper = makeMapper();
    const request = new Request("http://localhost/webhook/test?page=1", { method: "GET" });
    const item = await mapper.map(request, makeMatch({ methods: ["GET"] }));
    expect(item.json).toMatchObject({
      method: "GET",
      query: { page: "1" },
    });
    expect((item.json as { body?: unknown }).body).toBeUndefined();
  });

  it("includes headers in the mapped item", async () => {
    const mapper = makeMapper();
    const request = new Request("http://localhost/webhook/test", {
      method: "POST",
      headers: { "x-custom-header": "value-123" },
      body: "",
    });
    const item = await mapper.map(request, makeMatch());
    expect((item.json as { headers: Record<string, string> }).headers).toMatchObject({
      "x-custom-header": "value-123",
    });
  });

  it("maps multipart/form-data with text fields", async () => {
    const mapper = makeMapper();
    const formData = new FormData();
    formData.append("username", "alice");
    formData.append("email", "alice@example.com");
    const request = new Request("http://localhost/webhook/test", {
      method: "POST",
      body: formData,
    });
    const item = await mapper.map(request, makeMatch());
    expect((item.json as { formFields: Record<string, string> }).formFields).toMatchObject({
      username: "alice",
      email: "alice@example.com",
    });
    expect(item.binary).toBeUndefined();
  });

  it("maps multipart/form-data with a file attachment", async () => {
    const mapper = makeMapper();
    const formData = new FormData();
    formData.append("document", new Blob(["file content"], { type: "text/plain" }), "doc.txt");
    const request = new Request("http://localhost/webhook/test", {
      method: "POST",
      body: formData,
    });
    const item = await mapper.map(request, makeMatch());
    expect(item.binary).toBeDefined();
    expect(item.binary!["document"]).toBeDefined();
    expect(item.binary!["document"].mimeType).toBe("text/plain");
  });
});
