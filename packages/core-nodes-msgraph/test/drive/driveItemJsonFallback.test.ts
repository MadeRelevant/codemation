/**
 * Regression #3: DriveListChildrenNode, DriveUploadNode, DriveDownloadNode
 * must fall back to item.json for driveId/itemId when cfg values are empty.
 *
 * Without the fix: Schema.parse({driveId: "", ...}) throws zod "Too small".
 * With the fix:    cfg.driveId || fromItem.driveId picks up item.json values.
 */
import { describe, expect, it, vi } from "vitest";
import {
  DriveListChildren,
  DriveListChildrenNode,
  type GraphClient as ListChildrenGraphClient,
} from "../../src/drive/driveListChildrenNode";
import { DriveUpload, DriveUploadNode, type UploadHttp } from "../../src/drive/driveUploadNode";
import {
  DriveDownload,
  DriveDownloadNode,
  type DownloadHttp,
  type GraphClient as DownloadGraphClient,
} from "../../src/drive/driveDownloadNode";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession() {
  return { accessToken: "tok", refresh: vi.fn().mockResolvedValue("tok") };
}

async function withClientSpy<T>(client: unknown, fn: () => Promise<T>): Promise<T> {
  const mod = await import("../../src/credentials/session");
  const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);
  try {
    return await fn();
  } finally {
    spy.mockRestore();
  }
}

// ---------------------------------------------------------------------------
// #3a: DriveListChildrenNode falls back to item.json
// ---------------------------------------------------------------------------

describe("DriveListChildrenNode item.json fallback", () => {
  it("uses driveId and itemId from item.json when cfg values are empty strings", async () => {
    const req = {
      get: vi.fn().mockResolvedValue({ value: [] }),
      top: vi.fn().mockReturnThis(),
      filter: vi.fn().mockReturnThis(),
      orderby: vi.fn().mockReturnThis(),
    };
    const client: ListChildrenGraphClient & { api: ReturnType<typeof vi.fn> } = {
      api: vi.fn().mockReturnValue(req),
    };

    const session = makeSession();
    const ctx = {
      config: new DriveListChildren("list", { driveId: "", itemId: "" }),
      getCredential: vi.fn().mockResolvedValue(session),
      binary: { attach: vi.fn(), withAttachment: vi.fn(), openReadStream: vi.fn() },
    };
    const executeArgs = {
      item: { json: { driveId: "DR1", itemId: "I1" } },
      ctx: ctx as never,
      input: {} as never,
      itemIndex: 0,
      items: [] as never,
    };

    const node = new DriveListChildrenNode();
    await withClientSpy(client, () => node.execute(executeArgs));

    // Graph path must use the item.json values, not the empty cfg values
    expect(client.api).toHaveBeenCalledWith(expect.stringContaining("/DR1/"));
    expect(client.api).toHaveBeenCalledWith(expect.stringContaining("/I1/"));
  });
});

// ---------------------------------------------------------------------------
// #3b: DriveUploadNode falls back to item.json
// ---------------------------------------------------------------------------

describe("DriveUploadNode item.json fallback", () => {
  it("uses driveId and parentItemId from item.json when cfg values are empty strings", async () => {
    const uploadedItem = {
      id: "new-id",
      name: "file.txt",
      webUrl: "https://example.com",
      file: { mimeType: "text/plain" },
      parentReference: { driveId: "DR1" },
    };

    const uploadSimple = vi.fn().mockResolvedValue(uploadedItem);
    const http: UploadHttp = {
      uploadSimple,
      createUploadSession: vi.fn(),
      uploadChunk: vi.fn(),
    };

    const fileBody = Buffer.from("hello");
    const binaryAtt = {
      id: "att",
      storageKey: "key",
      mimeType: "text/plain",
      size: 5,
      storageDriver: "local",
      previewKind: "download" as const,
      createdAt: "2026-01-01T00:00:00Z",
      runId: "r1",
      workflowId: "w1",
      nodeId: "n1",
      activationId: "a1",
    };

    const fakeStream = (async function* () {
      yield fileBody;
    })();

    const binary = {
      attach: vi.fn(),
      withAttachment: vi.fn(),
      openReadStream: vi.fn().mockResolvedValue({ body: fakeStream, size: fileBody.byteLength }),
    };

    const session = makeSession();
    const ctx = {
      // Empty driveId and parentItemId — must come from item.json
      config: new DriveUpload("upload", { driveId: "", parentItemId: "", name: "file.txt", binarySlot: "f" }),
      getCredential: vi.fn().mockResolvedValue(session),
      binary,
    };
    const executeArgs = {
      item: { json: { driveId: "DR1", itemId: "P1" }, binary: { f: binaryAtt } } as never,
      ctx: ctx as never,
      input: {} as never,
      itemIndex: 0,
      items: [] as never,
    };

    const node = new DriveUploadNode(http);
    await node.execute(executeArgs);

    // uploadSimple must have received the item.json fallback values
    expect(uploadSimple).toHaveBeenCalledWith(expect.objectContaining({ driveId: "DR1", parentItemId: "P1" }));
  });
});

// ---------------------------------------------------------------------------
// #3c: DriveDownloadNode falls back to item.json
// ---------------------------------------------------------------------------

describe("DriveDownloadNode item.json fallback", () => {
  it("uses driveId and itemId from item.json when cfg values are empty strings", async () => {
    const metaResponse = {
      id: "I1",
      name: "doc.pdf",
      size: 100,
      lastModifiedDateTime: "2026-01-01T00:00:00Z",
      file: { mimeType: "application/pdf" },
      parentReference: { driveId: "DR1" },
    };

    const req = {
      get: vi.fn().mockResolvedValue(metaResponse),
    };
    const metaClient: DownloadGraphClient & { api: ReturnType<typeof vi.fn> } = {
      api: vi.fn().mockReturnValue(req),
    };

    const downloadHttp: DownloadHttp = {
      downloadContent: vi.fn().mockResolvedValue({ body: Buffer.from("bytes"), mimeType: "application/pdf" }),
    };

    const stored = {
      id: "att-1",
      storageKey: "k1",
      mimeType: "application/pdf",
      size: 100,
      storageDriver: "local",
      previewKind: "none" as const,
      createdAt: "2026-01-01T00:00:00Z",
      runId: "r1" as never,
      workflowId: "w1" as never,
      nodeId: "n1" as never,
      activationId: "a1" as never,
    };
    const binary = {
      attach: vi.fn().mockResolvedValue(stored),
      withAttachment: vi.fn().mockImplementation((item: unknown) => item),
      openReadStream: vi.fn(),
    };

    const session = makeSession();
    const ctx = {
      // Empty driveId and itemId — must come from item.json
      config: new DriveDownload("dl", { driveId: "", itemId: "" }),
      getCredential: vi.fn().mockResolvedValue(session),
      binary,
    };
    const executeArgs = {
      item: { json: { driveId: "DR1", itemId: "I1" }, binary: {} } as never,
      ctx: ctx as never,
      input: {} as never,
      itemIndex: 0,
      items: [] as never,
    };

    const node = new DriveDownloadNode(downloadHttp);
    await withClientSpy(metaClient, () => node.execute(executeArgs));

    // The metadata request URL must contain the item.json driveId and itemId
    expect(metaClient.api).toHaveBeenCalledWith(expect.stringContaining("/DR1/"));
    expect(metaClient.api).toHaveBeenCalledWith(expect.stringContaining("/I1"));

    // downloadContent must also have been invoked with the item.json ids
    expect(downloadHttp.downloadContent).toHaveBeenCalledWith(
      expect.objectContaining({ driveId: "DR1", itemId: "I1" }),
    );
  });
});
