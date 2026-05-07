import { describe, expect, it, vi } from "vitest";
import {
  driveDownloadNode,
  type DownloadHttp,
  type DriveDownloadOutput,
  type GraphClient,
  downloadItem,
  makeProductionDownloadHttp,
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

function makeReadableStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function makeDownloadHttp(body: ReadableStream<Uint8Array> | Uint8Array, mimeType?: string): DownloadHttp {
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DriveDownloadNode", () => {
  // -------------------------------------------------------------------------
  // 1. Happy path — downloads file and attaches binary
  // -------------------------------------------------------------------------
  it("downloads file and attaches stream via binary service (not on item JSON)", async () => {
    const meta = rawMeta({ name: "report.pdf", size: 500 });
    const metaClient = makeMetaClient(meta);
    const fileBytes = new Uint8Array(Buffer.from("PDF content bytes"));
    const fileStream = makeReadableStream(fileBytes);
    const downloadHttp = makeDownloadHttp(fileStream, "application/pdf");
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

    // binary.attach was called with a stream (not a Buffer) — never buffered into memory
    expect(binary.attach).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: "application/pdf",
        filename: "report.pdf",
      }),
    );
    const attachCall = (binary.attach as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { body: unknown };
    expect(attachCall.body).toBeInstanceOf(ReadableStream);
    // withAttachment was called to link the binary to the item
    expect(binary.withAttachment).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 2. Size cap exceeded — throws clear error
  // -------------------------------------------------------------------------
  it("throws a clear error when file size exceeds the cap", async () => {
    const meta = rawMeta({ name: "huge.zip", size: 200 * 1024 * 1024 });
    const metaClient = makeMetaClient(meta);
    const downloadHttp = makeDownloadHttp(makeReadableStream(new Uint8Array(0)));
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
    const downloadHttp = makeDownloadHttp(makeReadableStream(new Uint8Array(Buffer.from("data"))), "application/pdf");
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
        downloadHttp: makeDownloadHttp(makeReadableStream(new Uint8Array(Buffer.from("data"))), "application/pdf"),
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
  // 5. downloadItem pure function integration — with injected downloadHttp
  // -------------------------------------------------------------------------
  it("downloadItem invokes downloadHttp and attaches binary", async () => {
    const meta = rawMeta({ size: 100 });
    const client = makeMetaClient(meta);
    const fileStream = makeReadableStream(new Uint8Array(Buffer.from("content")));
    const downloadHttp = makeDownloadHttp(fileStream, "application/pdf");
    const binary = makeBinary();

    const session = { accessToken: "tok", refresh: vi.fn().mockResolvedValue("tok") };

    const result = await downloadItem({
      metadataClient: client,
      downloadHttp,
      session,
      input: { driveId: "drive-1", itemId: "item-1", sizeCapBytes: 100 * 1024 * 1024 },
      binary: binary as never,
      item: { json: {}, binary: {} } as never,
    });

    const out = result.json as DriveDownloadOutput;
    expect(out.name).toBe("report.pdf");
    expect(binary.attach).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 6. Defined node credential requirements
  // -------------------------------------------------------------------------
  it("driveDownloadNode has correct auth credential slot", () => {
    const config = driveDownloadNode.create({ driveId: "d", itemId: "i" }, "Download");
    const creds = config.getCredentialRequirements!();
    expect(creds).toHaveLength(1);
    expect(creds[0]!.slotKey).toBe("auth");
  });

  // -------------------------------------------------------------------------
  // 7. makeProductionDownloadHttp passes streams directly without buffering
  //    (Graph SDK 3.x returns a Web ReadableStream on Node 20+, or Node Readable)
  // -------------------------------------------------------------------------
  it("makeProductionDownloadHttp: passes Web ReadableStream directly to caller without buffering", async () => {
    const webStream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.enqueue(new Uint8Array(Buffer.from("web-readable-stream-data")));
        ctrl.close();
      },
    });

    const req = {
      getStream: vi.fn().mockResolvedValue(webStream),
    };
    const streamClient: GraphClient & { api: ReturnType<typeof vi.fn> } = {
      api: vi.fn().mockReturnValue(req),
    };

    const session = { accessToken: "tok", refresh: vi.fn().mockResolvedValue("tok") };

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(streamClient as never);
    try {
      const http = makeProductionDownloadHttp();
      const result = await http.downloadContent({ driveId: "drive-1", itemId: "item-1", session });
      // The stream is passed through directly, not buffered
      expect(result.body).toBe(webStream);
    } finally {
      spy.mockRestore();
    }
  });

  it("makeProductionDownloadHttp: passes Node.js Readable directly to caller without buffering", async () => {
    // Build a minimal Node.js Readable-like object (event-based API)
    const nodeReadable = {
      on(_event: string, _cb: (...args: unknown[]) => void) {
        return nodeReadable;
      },
    };

    const req = {
      getStream: vi.fn().mockResolvedValue(nodeReadable),
    };
    const streamClient: GraphClient & { api: ReturnType<typeof vi.fn> } = {
      api: vi.fn().mockReturnValue(req),
    };

    const session = { accessToken: "tok", refresh: vi.fn().mockResolvedValue("tok") };

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(streamClient as never);
    try {
      const http = makeProductionDownloadHttp();
      const result = await http.downloadContent({ driveId: "drive-1", itemId: "item-1", session });
      // The stream is passed through directly, not buffered
      expect(result.body).toBe(nodeReadable);
    } finally {
      spy.mockRestore();
    }
  });
});
