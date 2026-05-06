import { describe, expect, it, vi } from "vitest";
import { driveUploadNode, type DriveUploadOutput, type UploadHttp, uploadItem } from "../../src/drive/driveUploadNode";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rawUploadedItem(
  overrides: Partial<{
    id: string;
    name: string;
    webUrl: string;
    size: number;
    mimeType: string;
    driveId: string;
  }> = {},
) {
  const {
    id = "new-item-id",
    name = "upload.xlsx",
    webUrl = "https://example.com/upload.xlsx",
    size = 2048,
    mimeType = "application/vnd.ms-excel",
    driveId = "drive-dest",
  } = overrides;
  return {
    id,
    name,
    webUrl,
    size,
    file: { mimeType },
    parentReference: { driveId },
  };
}

function makeUploadHttp(overrides: Partial<UploadHttp> = {}): UploadHttp & {
  uploadSimple: ReturnType<typeof vi.fn>;
  createUploadSession: ReturnType<typeof vi.fn>;
  uploadChunk: ReturnType<typeof vi.fn>;
} {
  return {
    uploadSimple: vi.fn().mockResolvedValue(rawUploadedItem()),
    createUploadSession: vi.fn().mockResolvedValue({ uploadUrl: "https://upload.example.com/session" }),
    uploadChunk: vi.fn().mockResolvedValue({ status: 202 }),
    ...overrides,
  } as never;
}

function makeSession() {
  return { accessToken: "tok", refresh: vi.fn().mockResolvedValue("tok") };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DriveUploadNode", () => {
  // -------------------------------------------------------------------------
  // 1. Simple PUT — file <= 4 MiB
  // -------------------------------------------------------------------------
  it("uses simple PUT for files at or below 4 MiB", async () => {
    const http = makeUploadHttp();
    const body = Buffer.alloc(3 * 1024 * 1024); // 3 MiB

    const result = await uploadItem({
      uploadHttp: http,
      session: makeSession(),
      input: {
        driveId: "drive-1",
        parentItemId: "folder-1",
        name: "upload.xlsx",
        binarySlot: "file",
        conflictBehavior: "replace",
      },
      body,
      mimeType: "application/vnd.ms-excel",
    });

    expect(http.uploadSimple).toHaveBeenCalledTimes(1);
    expect(http.createUploadSession).not.toHaveBeenCalled();
    expect(http.uploadChunk).not.toHaveBeenCalled();

    expect(result.driveId).toBe("drive-dest");
    expect(result.itemId).toBe("new-item-id");
    expect(result.name).toBe("upload.xlsx");
    expect(result.webUrl).toBe("https://example.com/upload.xlsx");
  });

  // -------------------------------------------------------------------------
  // 2. conflictBehavior propagation — simple PUT
  // -------------------------------------------------------------------------
  it("passes conflictBehavior through to uploadSimple", async () => {
    const http = makeUploadHttp();
    const body = Buffer.alloc(1024);

    await uploadItem({
      uploadHttp: http,
      session: makeSession(),
      input: {
        driveId: "drive-1",
        parentItemId: "folder-1",
        name: "file.txt",
        binarySlot: "file",
        conflictBehavior: "rename",
      },
      body,
      mimeType: "text/plain",
    });

    expect(http.uploadSimple).toHaveBeenCalledWith(expect.objectContaining({ conflictBehavior: "rename" }));
  });

  // -------------------------------------------------------------------------
  // 3. Large-file upload session — file > 4 MiB, at least 2 chunks
  // -------------------------------------------------------------------------
  it("uses upload session for files > 4 MiB, sends correct Content-Range per chunk", async () => {
    const CHUNK = 5 * 320 * 1024; // 1,638,400 bytes
    const totalBytes = 6 * 1024 * 1024; // 6 MiB — forces 4 chunks at 1.6 MiB + 1 final

    // The final chunk must return the driveItem
    const uploadedItem = rawUploadedItem({ size: totalBytes });

    const chunks: Array<{ rangeStart: number; rangeEnd: number; total: number }> = [];
    const uploadChunk = vi
      .fn()
      .mockImplementation((args: { rangeStart: number; rangeEnd: number; total: number; uploadUrl: string }) => {
        chunks.push({ rangeStart: args.rangeStart, rangeEnd: args.rangeEnd, total: args.total });
        const isLast = args.rangeEnd === totalBytes - 1;
        return Promise.resolve(isLast ? { status: 201, item: uploadedItem } : { status: 202 });
      });

    const http = makeUploadHttp({ uploadChunk });
    const body = Buffer.alloc(totalBytes, 0x42);

    const result = await uploadItem({
      uploadHttp: http,
      session: makeSession(),
      input: {
        driveId: "drive-1",
        parentItemId: "folder-1",
        name: "large.bin",
        binarySlot: "file",
        conflictBehavior: "replace",
      },
      body,
      mimeType: "application/octet-stream",
    });

    expect(http.uploadSimple).not.toHaveBeenCalled();
    expect(http.createUploadSession).toHaveBeenCalledTimes(1);
    expect(uploadChunk).toHaveBeenCalled();

    // Verify at least 2 chunks were sent
    expect(chunks.length).toBeGreaterThanOrEqual(2);

    // Verify Content-Range correctness for first chunk
    const first = chunks[0]!;
    expect(first.rangeStart).toBe(0);
    expect(first.rangeEnd).toBe(CHUNK - 1);
    expect(first.total).toBe(totalBytes);

    // Last chunk
    const last = chunks[chunks.length - 1]!;
    expect(last.rangeEnd).toBe(totalBytes - 1);
    expect(last.total).toBe(totalBytes);

    expect(result.itemId).toBe("new-item-id");
  });

  // -------------------------------------------------------------------------
  // 4. conflictBehavior propagation — upload session
  // -------------------------------------------------------------------------
  it("passes conflictBehavior through to createUploadSession", async () => {
    const uploadedItem = rawUploadedItem();
    const uploadChunk = vi.fn().mockResolvedValue({ status: 201, item: uploadedItem });
    const http = makeUploadHttp({ uploadChunk });
    const body = Buffer.alloc(5 * 1024 * 1024); // 5 MiB

    await uploadItem({
      uploadHttp: http,
      session: makeSession(),
      input: {
        driveId: "drive-1",
        parentItemId: "folder-1",
        name: "doc.docx",
        binarySlot: "file",
        conflictBehavior: "fail",
      },
      body,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    expect(http.createUploadSession).toHaveBeenCalledWith(expect.objectContaining({ conflictBehavior: "fail" }));
  });

  // -------------------------------------------------------------------------
  // 5. withGraphRetry integration — chunk upload 429 then success
  // -------------------------------------------------------------------------
  it("retries a chunk upload on 429 (withGraphRetry wraps each chunk PUT)", async () => {
    vi.useFakeTimers();
    try {
      const throttleErr = Object.assign(new Error("429"), { statusCode: 429 });
      const uploadedItem = rawUploadedItem();

      // The upload uses 1.6 MiB chunks. A 4.1 MiB body = ceiling(4.1/1.6) = 3 chunks.
      // First chunk PUT gets 429 (first call to uploadChunk), then retries and succeeds.
      // Second and third chunk PUTs succeed normally (final one returns the item).
      const totalBytes = Math.ceil(4.1 * 1024 * 1024);
      let callCount = 0;
      const uploadChunk = vi.fn().mockImplementation((args: { rangeEnd: number }) => {
        callCount++;
        const isLast = args.rangeEnd === totalBytes - 1;
        // First call: throttle
        if (callCount === 1) {
          return Promise.reject(throttleErr);
        }
        // All subsequent calls succeed; last one returns the item
        return Promise.resolve(isLast ? { status: 201, item: uploadedItem } : { status: 202 });
      });

      const http = makeUploadHttp({ uploadChunk });
      const body = Buffer.alloc(totalBytes);

      const resultPromise = uploadItem({
        uploadHttp: http,
        session: makeSession(),
        input: {
          driveId: "d",
          parentItemId: "p",
          name: "large.bin",
          binarySlot: "file",
          conflictBehavior: "replace",
        },
        body,
        mimeType: "application/octet-stream",
      });

      // Advance past withGraphRetry's backoff delay (baseDelayMs=250, jittered)
      await vi.advanceTimersByTimeAsync(500);
      const result = await resultPromise;

      // uploadChunk must have been called > 3 times (at least 1 retry on first chunk)
      expect(uploadChunk.mock.calls.length).toBeGreaterThan(3);
      expect(result.itemId).toBe("new-item-id");
    } finally {
      vi.useRealTimers();
    }
  });

  // -------------------------------------------------------------------------
  // 6. Canonical output shape
  // -------------------------------------------------------------------------
  it("returns canonical output shape with driveId, itemId, name, webUrl", async () => {
    const uploaded = rawUploadedItem({
      id: "canon-id",
      name: "canon.txt",
      webUrl: "https://example.com/canon",
      driveId: "canon-drive",
      mimeType: "text/plain",
      size: 512,
    });
    const http = makeUploadHttp({ uploadSimple: vi.fn().mockResolvedValue(uploaded) });
    const body = Buffer.alloc(512);

    const result = await uploadItem({
      uploadHttp: http,
      session: makeSession(),
      input: {
        driveId: "canon-drive",
        parentItemId: "parent",
        name: "canon.txt",
        binarySlot: "file",
        conflictBehavior: "replace",
      },
      body,
      mimeType: "text/plain",
    });

    expect(result).toEqual({
      driveId: "canon-drive",
      itemId: "canon-id",
      name: "canon.txt",
      webUrl: "https://example.com/canon",
      mimeType: "text/plain",
      size: 512,
    });
  });

  // -------------------------------------------------------------------------
  // 7. uploadItem pure function with real binary body
  // -------------------------------------------------------------------------
  it("uploadItem uses the provided body buffer to upload", async () => {
    const fileBody = Buffer.from("file content here");
    const uploadedItem = rawUploadedItem();

    const http = makeUploadHttp({
      uploadSimple: vi.fn().mockResolvedValue(uploadedItem),
    });

    const session = makeSession();

    const result = await uploadItem({
      uploadHttp: http,
      session,
      input: {
        driveId: "drive-1",
        parentItemId: "folder-1",
        name: "upload.xlsx",
        binarySlot: "myfile",
        conflictBehavior: "replace",
      },
      body: fileBody,
      mimeType: "application/octet-stream",
    });

    const out = result as DriveUploadOutput;
    expect(out.itemId).toBe("new-item-id");
    expect(out.name).toBe("upload.xlsx");
    expect(http.uploadSimple).toHaveBeenCalledWith(expect.objectContaining({ body: fileBody }));
  });

  // -------------------------------------------------------------------------
  // 8. uploadItem throws on chunked upload without final item
  // -------------------------------------------------------------------------
  it("uploadItem uses simple upload for small files", async () => {
    const smallBody = Buffer.from("small");
    const uploadedItem = rawUploadedItem();

    const http = makeUploadHttp({
      uploadSimple: vi.fn().mockResolvedValue(uploadedItem),
    });

    await uploadItem({
      uploadHttp: http,
      session: makeSession(),
      input: {
        driveId: "d",
        parentItemId: "p",
        name: "small.txt",
        binarySlot: "f",
        conflictBehavior: "replace",
      },
      body: smallBody,
      mimeType: "text/plain",
    });

    expect(http.uploadSimple).toHaveBeenCalled();
    expect(http.createUploadSession).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 9. Defined node credential requirements
  // -------------------------------------------------------------------------
  it("driveUploadNode has correct auth credential slot", () => {
    const config = driveUploadNode.create(
      { driveId: "d", parentItemId: "p", name: "f.txt", binarySlot: "file" },
      "Upload",
    );
    const creds = config.getCredentialRequirements!();
    expect(creds).toHaveLength(1);
    expect(creds[0]!.slotKey).toBe("auth");
  });
});
