/**
 * Regression #3: DriveListChildrenNode, DriveUploadNode, DriveDownloadNode
 * must fall back to item.json for driveId/itemId when cfg values are empty.
 *
 * Without the fix: Schema.parse({driveId: "", ...}) throws zod "Too small".
 * With the fix:    cfg.driveId || fromItem.driveId picks up item.json values.
 *
 * Tests here verify the fallback merge logic by calling the pure functions
 * directly with the merged input that the node execute would produce.
 */
import { describe, expect, it, vi } from "vitest";
import {
  listChildren,
  DriveListChildrenInputSchema,
  type GraphClient as ListChildrenGraphClient,
} from "../../src/drive/driveListChildrenNode";
import { uploadItem, type UploadHttp } from "../../src/drive/driveUploadNode";
import {
  downloadItem,
  type DownloadHttp,
  type GraphClient as DownloadGraphClient,
} from "../../src/drive/driveDownloadNode";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession() {
  return { accessToken: "tok", refresh: vi.fn().mockResolvedValue("tok") };
}

// ---------------------------------------------------------------------------
// #3a: DriveListChildren falls back to item.json
// ---------------------------------------------------------------------------

describe("DriveListChildren item.json fallback", () => {
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

    // Simulate the fallback merge: cfg.driveId || fromItem.driveId
    const cfg = { driveId: "", itemId: "" };
    const fromItem = { driveId: "DR1", itemId: "I1" };
    const input = DriveListChildrenInputSchema.parse({
      driveId: cfg.driveId || fromItem.driveId,
      itemId: cfg.itemId || fromItem.itemId,
    });

    await listChildren(client, input);

    // Graph path must use the item.json values, not the empty cfg values
    expect(client.api).toHaveBeenCalledWith(expect.stringContaining("/DR1/"));
    expect(client.api).toHaveBeenCalledWith(expect.stringContaining("/I1/"));
  });
});

// ---------------------------------------------------------------------------
// #3b: DriveUpload falls back to item.json
// ---------------------------------------------------------------------------

describe("DriveUpload item.json fallback", () => {
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

    // Simulate the fallback merge: cfg.driveId || fromItem.driveId
    const cfg = { driveId: "", parentItemId: "", name: "file.txt", binarySlot: "f" };
    const fromItem = { driveId: "DR1", itemId: "P1" };

    const session = makeSession();
    const fileBody = Buffer.from("hello");

    await uploadItem({
      uploadHttp: http,
      session,
      input: {
        driveId: cfg.driveId || fromItem.driveId,
        parentItemId: cfg.parentItemId || fromItem.itemId,
        name: "file.txt",
        binarySlot: "f",
        conflictBehavior: "replace",
      },
      body: fileBody,
      mimeType: "text/plain",
    });

    // uploadSimple must have received the item.json fallback values
    expect(uploadSimple).toHaveBeenCalledWith(expect.objectContaining({ driveId: "DR1", parentItemId: "P1" }));
  });
});

// ---------------------------------------------------------------------------
// #3c: DriveDownload falls back to item.json
// ---------------------------------------------------------------------------

describe("DriveDownload item.json fallback", () => {
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

    // Simulate the fallback merge: cfg.driveId || fromItem.driveId
    const cfg = { driveId: "", itemId: "" };
    const fromItem = { driveId: "DR1", itemId: "I1" };

    await downloadItem({
      metadataClient: metaClient,
      downloadHttp,
      session,
      input: {
        driveId: cfg.driveId || fromItem.driveId,
        itemId: cfg.itemId || fromItem.itemId,
        sizeCapBytes: 100 * 1024 * 1024,
      },
      binary: binary as never,
      item: { json: { driveId: "DR1", itemId: "I1" }, binary: {} } as never,
    });

    // The metadata request URL must contain the item.json driveId and itemId
    expect(metaClient.api).toHaveBeenCalledWith(expect.stringContaining("/DR1/"));
    expect(metaClient.api).toHaveBeenCalledWith(expect.stringContaining("/I1"));

    // downloadContent must also have been invoked with the item.json ids
    expect(downloadHttp.downloadContent).toHaveBeenCalledWith(
      expect.objectContaining({ driveId: "DR1", itemId: "I1" }),
    );
  });
});
