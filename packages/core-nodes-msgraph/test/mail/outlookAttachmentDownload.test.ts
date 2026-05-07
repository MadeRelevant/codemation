import { describe, expect, it, vi } from "vitest";
import {
  downloadAttachment,
  outlookAttachmentDownloadNode,
  type OutlookAttachmentDownloadInput,
  type GraphClient,
} from "../../src/mail/outlookAttachmentDownloadNode";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFileAttachmentResponse(
  overrides: Partial<{
    id: string;
    name: string;
    contentType: string;
    size: number;
    isInline: boolean;
    contentId: string | null;
    contentBytes: string;
    odataType: string;
  }> = {},
) {
  const {
    id = "att-1",
    name = "resume.pdf",
    contentType = "application/pdf",
    size = 1024,
    isInline = false,
    contentId = null,
    contentBytes = Buffer.from("PDF file bytes").toString("base64"),
    odataType = "#microsoft.graph.fileAttachment",
  } = overrides;
  return {
    "@odata.type": odataType,
    id,
    name,
    contentType,
    size,
    isInline,
    contentId,
    contentBytes,
  };
}

function makeGraphClient(
  metaResponse: unknown,
  streamBody?: Uint8Array,
): GraphClient & {
  _req: { get: ReturnType<typeof vi.fn>; getStream: ReturnType<typeof vi.fn> };
  api: ReturnType<typeof vi.fn>;
} {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (streamBody) controller.enqueue(streamBody);
      controller.close();
    },
  });
  const req = {
    get: vi.fn().mockResolvedValue(metaResponse),
    getStream: vi.fn().mockResolvedValue(stream),
  };
  const client = { api: vi.fn().mockReturnValue(req), _req: req };
  return client;
}

function makeBinaryAtt() {
  return {
    id: "stored-1",
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

const DEFAULT_INPUT: OutlookAttachmentDownloadInput = {
  mailbox: "me",
  messageId: "msg-1",
  attachmentId: "att-1",
  binarySlot: "attachment",
  sizeCapBytes: 25 * 1024 * 1024,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OutlookAttachmentDownload", () => {
  // -------------------------------------------------------------------------
  // 1. Happy path
  // -------------------------------------------------------------------------
  it("downloads file attachment, attaches bytes via binary service, returns correct output fields", async () => {
    const rawBytes = Buffer.from("PDF file bytes");
    const attachment = makeFileAttachmentResponse({
      name: "resume.pdf",
      contentType: "application/pdf",
      size: rawBytes.length,
      contentBytes: rawBytes.toString("base64"),
    });
    const client = makeGraphClient(attachment, rawBytes);
    const binary = makeBinary();

    const result = await downloadAttachment({
      client,
      input: DEFAULT_INPUT,
      binary: binary as never,
      item: { json: {}, binary: {} } as never,
    });

    // Output JSON fields
    expect(result.json.messageId).toBe("msg-1");
    expect(result.json.attachmentId).toBe("att-1");
    expect(result.json.filename).toBe("resume.pdf");
    expect(result.json.contentType).toBe("application/pdf");
    expect(result.json.size).toBe(rawBytes.length);
    expect(result.json.isInline).toBe(false);
    expect(result.json.contentId).toBeNull();
    expect(result.json.binarySlot).toBe("attachment");

    // Bytes must NOT be on item JSON
    expect(result.json).not.toHaveProperty("contentBytes");
    expect(result.json).not.toHaveProperty("body");

    // binary.attach called with a stream (not buffered into memory)
    expect(binary.attach).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "attachment",
        mimeType: "application/pdf",
        filename: "resume.pdf",
      }),
    );
    const attachCall = (binary.attach as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { body: unknown };
    expect(attachCall.body).toBeInstanceOf(ReadableStream);

    // Two-phase: metadata via .get() then bytes via .getStream() — never base64 in JSON.
    expect(client._req.get).toHaveBeenCalledTimes(1);
    expect(client._req.getStream).toHaveBeenCalledTimes(1);
    expect(client.api).toHaveBeenCalledWith(expect.stringContaining("$select="));
    expect(client.api).toHaveBeenCalledWith(expect.stringMatching(/\/\$value$/));

    // withAttachment called to link binary to item
    expect(binary.withAttachment).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 2. Size cap exceeded — refuses before allocating buffer
  // -------------------------------------------------------------------------
  it("throws a clear error when attachment size exceeds the cap, without decoding the buffer", async () => {
    const attachment = makeFileAttachmentResponse({
      name: "bigfile.pdf",
      size: 100,
      // contentBytes is set but should never be decoded
      contentBytes: Buffer.alloc(100).toString("base64"),
    });
    const client = makeGraphClient(attachment);
    const binary = makeBinary();

    await expect(
      downloadAttachment({
        client,
        input: { ...DEFAULT_INPUT, sizeCapBytes: 10 },
        binary: binary as never,
        item: { json: {}, binary: {} } as never,
      }),
    ).rejects.toThrow(/exceeds the size cap/);

    // binary.attach must not be called (no buffer allocated)
    expect(binary.attach).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 3. Wrong attachment type (itemAttachment) — throws clear error
  // -------------------------------------------------------------------------
  it("throws a clear error for itemAttachment (no contentBytes)", async () => {
    const attachment = makeFileAttachmentResponse({
      odataType: "#microsoft.graph.itemAttachment",
    });
    const client = makeGraphClient(attachment);
    const binary = makeBinary();

    await expect(
      downloadAttachment({
        client,
        input: DEFAULT_INPUT,
        binary: binary as never,
        item: { json: {}, binary: {} } as never,
      }),
    ).rejects.toThrow(/#microsoft.graph.itemAttachment/);
  });

  // -------------------------------------------------------------------------
  // 4. Item.json fallback — cfg ids are empty, item.json provides them
  // -------------------------------------------------------------------------
  it("falls back to item.json.messageId / attachmentId when cfg ids are empty", async () => {
    const attachment = makeFileAttachmentResponse({ name: "cv.pdf", size: 50 });
    const client = makeGraphClient(attachment);
    const binary = makeBinary();

    await downloadAttachment({
      client,
      input: {
        mailbox: "me",
        messageId: "msg-from-json",
        attachmentId: "att-from-json",
        binarySlot: "attachment",
        sizeCapBytes: 25 * 1024 * 1024,
      },
      binary: binary as never,
      item: { json: { messageId: "msg-from-json", attachmentId: "att-from-json" }, binary: {} } as never,
    });

    // URL built from item.json values (messageId + attachmentId are URL-encoded)
    expect(client.api).toHaveBeenCalledWith(expect.stringContaining("msg-from-json"));
    expect(client.api).toHaveBeenCalledWith(expect.stringContaining("att-from-json"));
  });

  // -------------------------------------------------------------------------
  // 5. Custom slot name
  // -------------------------------------------------------------------------
  it("uses the custom binarySlot name when attaching binary", async () => {
    const attachment = makeFileAttachmentResponse({ name: "resume.docx", size: 200 });
    const client = makeGraphClient(attachment);
    const binary = makeBinary();

    await downloadAttachment({
      client,
      input: { ...DEFAULT_INPUT, binarySlot: "resume" },
      binary: binary as never,
      item: { json: {}, binary: {} } as never,
    });

    expect(binary.attach).toHaveBeenCalledWith(expect.objectContaining({ name: "resume" }));
  });

  // -------------------------------------------------------------------------
  // 6. Node credential requirements
  // -------------------------------------------------------------------------
  it("outlookAttachmentDownloadNode declares correct auth credential slot", () => {
    const cfgNode = outlookAttachmentDownloadNode.create({
      messageId: "m-1",
      attachmentId: "a-1",
    } as never);
    const creds = cfgNode.getCredentialRequirements!();
    expect(creds).toHaveLength(1);
    expect(creds[0]!.slotKey).toBe("auth");
  });
});
