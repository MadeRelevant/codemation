// @vitest-environment node

import { describe, expect, it } from "vitest";
import type {
  BinaryAttachment,
  BinaryStorage,
  BinaryStorageReadResult,
  BinaryStorageWriteResult,
} from "@codemation/core";
import type { CommandBus } from "../../src/application/bus/CommandBus";
import type { QueryBus } from "../../src/application/bus/QueryBus";
import { BinaryHttpRouteHandler } from "../../src/presentation/http/routeHandlers/BinaryHttpRouteHandlerFactory";
import type { ServerHttpRouteParams } from "../../src/presentation/http/ServerHttpRouteParams";

class SimpleInMemoryStorage implements BinaryStorage {
  readonly driverName = "test-memory";
  private readonly values = new Map<string, Uint8Array>();

  async write(args: { storageKey: string; body: never }): Promise<BinaryStorageWriteResult> {
    const bytes = new Uint8Array([1, 2, 3]);
    this.values.set(args.storageKey, bytes);
    return { storageKey: args.storageKey, size: 3, sha256: "abc" };
  }

  async store(storageKey: string, data: Uint8Array): Promise<void> {
    this.values.set(storageKey, data);
  }

  async openReadStream(storageKey: string): Promise<BinaryStorageReadResult | undefined> {
    const bytes = this.values.get(storageKey);
    if (!bytes) return undefined;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    return { body: stream as never, size: bytes.byteLength };
  }

  async stat(storageKey: string): Promise<{ exists: boolean; size?: number }> {
    const bytes = this.values.get(storageKey);
    return bytes ? { exists: true, size: bytes.byteLength } : { exists: false };
  }

  async delete(storageKey: string): Promise<void> {
    this.values.delete(storageKey);
  }

  async deleteMany(storageKeys: ReadonlyArray<string>): Promise<void> {
    for (const key of storageKeys) {
      this.values.delete(key);
    }
  }

  async listByPrefix(prefix: string): Promise<ReadonlyArray<string>> {
    return Array.from(this.values.keys()).filter((key) => key.startsWith(prefix));
  }
}

function makeAttachment(overrides: Partial<BinaryAttachment> = {}): BinaryAttachment {
  return {
    id: "bin_1",
    storageKey: "storage/key/bin_1",
    mimeType: "image/png",
    size: 1024,
    filename: "test.png",
    previewKind: "image",
    ...overrides,
  } as BinaryAttachment;
}

class QueryBusStub implements QueryBus {
  constructor(private readonly result: unknown) {}
  async execute<TResult>(): Promise<TResult> {
    return this.result as TResult;
  }
}

class CommandBusStub implements CommandBus {
  lastCommand: unknown = undefined;
  constructor(private readonly result: unknown) {}
  async execute<TResult>(command: unknown): Promise<TResult> {
    this.lastCommand = command;
    return this.result as TResult;
  }
}

function makeHandler(
  args: {
    queryResult?: unknown;
    commandResult?: unknown;
    storage?: BinaryStorage;
  } = {},
): BinaryHttpRouteHandler {
  const storage = args.storage ?? new SimpleInMemoryStorage();
  return new BinaryHttpRouteHandler(
    new QueryBusStub(args.queryResult) as unknown as QueryBus,
    new CommandBusStub(args.commandResult ?? makeAttachment()) as unknown as CommandBus,
    storage,
  );
}

async function makeStorageWithKey(key: string): Promise<SimpleInMemoryStorage> {
  const storage = new SimpleInMemoryStorage();
  await storage.store(key, new Uint8Array([1, 2, 3]));
  return storage;
}

const emptyParams: ServerHttpRouteParams = { runId: "run_1", binaryId: "bin_1", workflowId: "wf_1" };

describe("BinaryHttpRouteHandler.getRunBinaryContent", () => {
  it("returns 404 when attachment is not found", async () => {
    const handler = makeHandler({ queryResult: undefined });
    const response = await handler.getRunBinaryContent(new Request("http://localhost"), emptyParams);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "Unknown binary attachment" });
  });

  it("returns 404 when binary content unavailable in storage", async () => {
    const attachment = makeAttachment({ storageKey: "nonexistent" });
    const handler = makeHandler({ queryResult: attachment });
    const response = await handler.getRunBinaryContent(new Request("http://localhost"), emptyParams);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "Binary attachment content is unavailable" });
  });

  it("returns 200 with binary content when found", async () => {
    const storage = await makeStorageWithKey("storage/bin_1");
    const attachment = makeAttachment({
      storageKey: "storage/bin_1",
      size: 3,
      mimeType: "text/plain",
      filename: "hello.txt",
    });
    const handler = makeHandler({ queryResult: attachment, storage });
    const response = await handler.getRunBinaryContent(new Request("http://localhost"), emptyParams);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain");
    expect(response.headers.get("content-disposition")).toContain("hello.txt");
  });
});

describe("BinaryHttpRouteHandler.getWorkflowOverlayBinaryContent", () => {
  it("returns 404 when overlay attachment is not found", async () => {
    const handler = makeHandler({ queryResult: undefined });
    const response = await handler.getWorkflowOverlayBinaryContent(new Request("http://localhost"), emptyParams);
    expect(response.status).toBe(404);
  });

  it("returns 200 with content when overlay attachment found", async () => {
    const storage = await makeStorageWithKey("storage/overlay_1");
    const attachment = makeAttachment({ storageKey: "storage/overlay_1", previewKind: "download" });
    const handler = makeHandler({ queryResult: attachment, storage });
    const response = await handler.getWorkflowOverlayBinaryContent(new Request("http://localhost"), emptyParams);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("attachment");
  });
});

describe("BinaryHttpRouteHandler.postWorkflowDebuggerOverlayBinaryUpload", () => {
  it("returns 400 when nodeId is missing", async () => {
    const handler = makeHandler();
    const formData = new FormData();
    formData.append("file", new Blob(["data"]), "test.txt");
    // no nodeId
    const request = new Request("http://localhost", { method: "POST", body: formData });
    const response = await handler.postWorkflowDebuggerOverlayBinaryUpload(request, emptyParams);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "nodeId is required" });
  });

  it("returns 400 when file is missing", async () => {
    const handler = makeHandler();
    const formData = new FormData();
    formData.append("nodeId", "node_1");
    formData.append("itemIndex", "0");
    const request = new Request("http://localhost", { method: "POST", body: formData });
    const response = await handler.postWorkflowDebuggerOverlayBinaryUpload(request, emptyParams);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "file is required" });
  });

  it("returns 400 for non-integer itemIndex", async () => {
    const handler = makeHandler();
    const formData = new FormData();
    formData.append("nodeId", "node_1");
    formData.append("itemIndex", "abc");
    formData.append("file", new Blob(["x"]), "test.txt");
    const request = new Request("http://localhost", { method: "POST", body: formData });
    const response = await handler.postWorkflowDebuggerOverlayBinaryUpload(request, emptyParams);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "itemIndex must be a non-negative integer" });
  });

  it("returns 201 with attachment on successful upload", async () => {
    const attachment = makeAttachment();
    const handler = makeHandler({ commandResult: attachment });
    const formData = new FormData();
    formData.append("nodeId", "node_1");
    formData.append("itemIndex", "0");
    formData.append("attachmentName", "myfile");
    formData.append("file", new Blob(["hello world"], { type: "text/plain" }), "hello.txt");
    const request = new Request("http://localhost", { method: "POST", body: formData });
    const response = await handler.postWorkflowDebuggerOverlayBinaryUpload(request, emptyParams);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ attachment: expect.objectContaining({ id: "bin_1" }) });
  });
});

describe("BinaryHttpRouteHandler content-disposition", () => {
  it("uses 'inline' disposition for non-download previewKind", async () => {
    const storage = await makeStorageWithKey("storage/inline_1");
    const attachment = makeAttachment({ storageKey: "storage/inline_1", previewKind: "image", filename: "photo.png" });
    const handler = makeHandler({ queryResult: attachment, storage });
    const response = await handler.getRunBinaryContent(new Request("http://localhost"), emptyParams);
    expect(response.headers.get("content-disposition")).toContain("inline");
  });

  it("uses 'attachment' disposition for download previewKind", async () => {
    const storage = await makeStorageWithKey("storage/dl_1");
    const attachment = makeAttachment({ storageKey: "storage/dl_1", previewKind: "download", filename: "file.zip" });
    const handler = makeHandler({ queryResult: attachment, storage });
    const response = await handler.getRunBinaryContent(new Request("http://localhost"), emptyParams);
    expect(response.headers.get("content-disposition")).toContain("attachment");
  });

  it("strips double quotes from filename so they do not break the header", async () => {
    const storage = await makeStorageWithKey("storage/q_1");
    // filename contains embedded double-quotes; escapeFilename removes them
    // 'test"file.txt' → 'testfile.txt'
    const attachment = makeAttachment({ storageKey: "storage/q_1", filename: 'test"file.txt', previewKind: "image" });
    const handler = makeHandler({ queryResult: attachment, storage });
    const response = await handler.getRunBinaryContent(new Request("http://localhost"), emptyParams);
    const disposition = response.headers.get("content-disposition")!;
    // After stripping, 'test"file.txt' → 'testfile.txt'
    expect(disposition).toContain("testfile.txt");
    // There should be no broken header value — the disposition should be parseable
    expect(disposition).toMatch(/^(inline|attachment); filename="[^"]*"$/);
  });

  it("falls back to attachment id in filename when filename is not set", async () => {
    const storage = await makeStorageWithKey("storage/nf_1");
    const attachment = makeAttachment({ storageKey: "storage/nf_1", filename: undefined, previewKind: "image" });
    const handler = makeHandler({ queryResult: attachment, storage });
    const response = await handler.getRunBinaryContent(new Request("http://localhost"), emptyParams);
    const disposition = response.headers.get("content-disposition")!;
    expect(disposition).toContain("bin_1");
  });
});
