import { describe, expect, it, vi } from "vitest";
import {
  DriveDownload,
  DriveDownloadNode,
  type DownloadHttp,
  type DriveDownloadOutput,
  type GraphClient,
  downloadItem,
} from "../../src/drive/driveDownloadNode";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rawMeta(
  overrides: Partial<{
    id: string;
    name: string;
    size: number;
    mimeType: string;
    driveId: string;
  }> = {},
) {
  const {
    id = "item-1",
    name = "report.pdf",
    size = 1024,
    mimeType = "application/pdf",
    driveId = "drive-abc",
  } = overrides;
  return {
    id,
    name,
    size,
    lastModifiedDateTime: "2026-03-01T00:00:00Z",
    file: { mimeType },
    parentReference: { driveId },
  };
}

function makeMetaClient(response: unknown) {
  const req = {
    get: vi.fn().mockResolvedValue(response),
  };
  const client: GraphClient & { _req: typeof req } = {
    api: vi.fn().mockReturnValue(req),
    _req: req,
  };
  return client;
}

function makeDownloadHttp(body: Buffer, mimeType?: string): DownloadHttp {
  return {
    downloadContent: vi.fn().mockResolvedValue({ body, mimeType }),
  };
}

function makeBinaryAtt() {
  return {
    id: "att-1",
    storageKey: "key-1",
    mimeType: "application/pdf",
    size: 1024,
    storageDriver: "local",
    previewKind: "none" as const,
    createdAt: "2026-01-01T00:00:00Z",
    runId: "run-1" as never,
    workflowId: "wf-1" as never,
    nodeId: "node-1" as never,
    activationId: "act-1" as never,
  };
}

function makeBinary() {
  return {
    attach: vi.fn().mockResolvedValue(makeBinaryAtt()),
    withAttachment: vi.fn().mockImplementation((item: unknown) => item),
    openReadStream: vi.fn(),
  };
}

async function withClientSpy<T>(client: GraphClient, fn: () => Promise<T>): Promise<T> {
  const mod = await import("../../src/credentials/session");
  const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);
  try {
    return await fn();
  } finally {
    spy.mockRestore();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DriveDownloadNode", () => {
  // -------------------------------------------------------------------------
  // 1. Happy path — downloads file and attaches binary
  // -------------------------------------------------------------------------
  it("downloads file and attaches bytes via binary service (not on item JSON)", async () => {
    const meta = rawMeta({ name: "report.pdf", size: 500 });
    const metaClient = makeMetaClient(meta);
    const fileBody = Buffer.from("PDF content bytes");
    const downloadHttp = makeDownloadHttp(fileBody, "application/pdf");
    const binary = makeBinary();

    const result = await downloadItem({
      metadataClient: metaClient,
      downloadHttp,
      session: { accessToken: "tok", refresh: vi.fn().mockResolvedValue("tok") },
      input: { driveId: "drive-1", itemId: "item-1", sizeCapBytes: 100 * 1024 * 1024 },
      binary: binary as never,
      item: { json: {}, binary: {} } as never,
    });

    // Bytes must NOT be on item JSON
    const jsonOut = result.json as DriveDownloadOutput;
    expect(jsonOut).not.toHaveProperty("body");
    expect(jsonOut).not.toHaveProperty("base64");

    // Correct metadata fields on JSON
    expect(jsonOut.name).toBe("report.pdf");
    expect(jsonOut.mimeType).toBe("application/pdf");
    expect(jsonOut.size).toBe(500);
    expect(jsonOut.driveId).toBe("drive-1");
    expect(jsonOut.itemId).toBe("item-1");

    // binary.attach was called with the Buffer body
    expect(binary.attach).toHaveBeenCalledWith(
      expect.objectContaining({
        body: fileBody,
        mimeType: "application/pdf",
        filename: "report.pdf",
      }),
    );
    // withAttachment was called to link the binary to the item
    expect(binary.withAttachment).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 2. Size cap exceeded — throws clear error
  // -------------------------------------------------------------------------
  it("throws a clear error when file size exceeds the cap", async () => {
    const meta = rawMeta({ name: "huge.zip", size: 200 * 1024 * 1024 });
    const metaClient = makeMetaClient(meta);
    const downloadHttp = makeDownloadHttp(Buffer.alloc(0));
    const binary = makeBinary();

    await expect(
      downloadItem({
        metadataClient: metaClient,
        downloadHttp,
        session: { accessToken: "tok", refresh: vi.fn().mockResolvedValue("tok") },
        input: { driveId: "d", itemId: "i", sizeCapBytes: 100 * 1024 * 1024 },
        binary: binary as never,
        item: { json: {}, binary: {} } as never,
      }),
    ).rejects.toThrow(/exceeds the size cap/);

    // Must not have called downloadContent
    expect(downloadHttp.downloadContent).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 3. Slot name sanitization — special characters in filename
  // -------------------------------------------------------------------------
  it("sanitizes filename for use as binary slot name (no path-separator chars)", async () => {
    const meta = rawMeta({ name: "file/with:special<chars>.pdf", size: 100 });
    const metaClient = makeMetaClient(meta);
    const downloadHttp = makeDownloadHttp(Buffer.from("data"), "application/pdf");
    const binary = makeBinary();

    await downloadItem({
      metadataClient: metaClient,
      downloadHttp,
      session: { accessToken: "tok", refresh: vi.fn().mockResolvedValue("tok") },
      input: { driveId: "d", itemId: "i", sizeCapBytes: 100 * 1024 * 1024 },
      binary: binary as never,
      item: { json: {}, binary: {} } as never,
    });

    const attachCall = (binary.attach as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(attachCall.name).not.toMatch(/[/\\:*?"<>|]/);
  });

  // -------------------------------------------------------------------------
  // 4. withGraphRetry integration on metadata — one 429 then success
  // -------------------------------------------------------------------------
  it("retries metadata fetch on 429 and eventually succeeds", async () => {
    vi.useFakeTimers();
    try {
      const throttleErr = Object.assign(new Error("429"), { statusCode: 429 });
      const getMock = vi
        .fn()
        .mockRejectedValueOnce(throttleErr)
        .mockResolvedValueOnce(rawMeta({ size: 100 }));

      const req = { get: getMock };
      const metaClient: GraphClient = { api: vi.fn().mockReturnValue(req) };
      const binary = makeBinary();

      const resultPromise = downloadItem({
        metadataClient: metaClient,
        downloadHttp: makeDownloadHttp(Buffer.from("data"), "application/pdf"),
        session: { accessToken: "tok", refresh: vi.fn().mockResolvedValue("tok") },
        input: { driveId: "d", itemId: "i", sizeCapBytes: 100 * 1024 * 1024 },
        binary: binary as never,
        item: { json: {}, binary: {} } as never,
      });

      await vi.advanceTimersByTimeAsync(500);
      await resultPromise;

      expect(getMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  // -------------------------------------------------------------------------
  // 5. Node execute — integration via withClientSpy (injects downloadHttp)
  // -------------------------------------------------------------------------
  it("node execute invokes downloadHttp and attaches binary", async () => {
    const meta = rawMeta({ size: 100 });
    const client = makeMetaClient(meta);
    const fileBody = Buffer.from("content");
    const downloadHttp = makeDownloadHttp(fileBody, "application/pdf");
    const binary = makeBinary();

    const session = { accessToken: "tok", refresh: vi.fn().mockResolvedValue("tok") };
    const ctx = {
      config: new DriveDownload("dl", { driveId: "drive-1", itemId: "item-1" }),
      getCredential: vi.fn().mockResolvedValue(session),
      binary,
    };
    const executeArgs = {
      item: { json: {}, binary: {} },
      ctx: ctx as never,
      input: {} as never,
      itemIndex: 0,
      items: [] as never,
    };

    const node = new DriveDownloadNode(downloadHttp);
    const result = await withClientSpy(client, () => node.execute(executeArgs));

    const out = (result as { json: DriveDownloadOutput }).json;
    expect(out.name).toBe("report.pdf");
    expect(binary.attach).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 6. Config class
  // -------------------------------------------------------------------------
  it("DriveDownload config declares correct credential requirements", () => {
    const cfg = new DriveDownload("dl", { driveId: "d", itemId: "i" });
    const creds = cfg.getCredentialRequirements();
    expect(creds).toHaveLength(1);
    expect(creds[0]!.slotKey).toBe("auth");
  });
});
