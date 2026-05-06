import { describe, expect, it, vi } from "vitest";
import { sendMessage } from "../../src/mail/outlookMessageSendNode";
import type { OutlookMessageSendOptions } from "../../src/mail/outlookMessageSendNode";
import type { BinaryAttachment, NodeBinaryAttachmentService } from "@codemation/core";

type GraphApiRequest = {
  post(body: unknown): Promise<unknown>;
  patch(body: unknown): Promise<unknown>;
};

type GraphClient = { api(url: string): GraphApiRequest };

function makeClient(draftId = "draft-send-1"): { client: GraphClient; req: GraphApiRequest } {
  const req: GraphApiRequest = {
    post: vi.fn().mockResolvedValue({ id: draftId }),
    patch: vi.fn().mockResolvedValue(undefined),
  };
  const client: GraphClient = { api: vi.fn().mockReturnValue(req) };
  return { client, req };
}

function makeBinary(fakeBytes = Buffer.from("attachment data")): NodeBinaryAttachmentService {
  const readableStream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(fakeBytes));
      controller.close();
    },
  });
  return {
    openReadStream: vi.fn().mockResolvedValue({ body: readableStream, size: fakeBytes.length }),
    attach: vi.fn(),
    withAttachment: vi.fn(),
  } as unknown as NodeBinaryAttachmentService;
}

function makeItemBinary(slots: Record<string, { mimeType: string }> = {}): Record<string, BinaryAttachment> {
  return Object.fromEntries(
    Object.entries(slots).map(([slot, meta]) => [
      slot,
      {
        id: `bin-${slot}`,
        storageKey: `key-${slot}`,
        mimeType: meta.mimeType,
        size: 100,
        storageDriver: "mem",
        previewKind: "download" as const,
        createdAt: "2026-01-01T00:00:00Z",
        runId: "r1",
        workflowId: "w1",
        nodeId: "n1",
        activationId: "a1",
      } as BinaryAttachment,
    ]),
  );
}

describe("sendMessage (outlookMessageSendNode helper)", () => {
  it("happy path (draftOnly: false): calls /sendMail and returns messageId: ''", async () => {
    const { client, req } = makeClient();
    (req.post as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const binary = makeBinary();

    const cfg: OutlookMessageSendOptions = {
      mailbox: "me",
      to: ["recipient@example.com"],
      subject: "Hello",
      body: "World",
      bodyType: "text",
    };

    const result = await sendMessage(client as never, binary, {}, cfg);

    expect(client.api).toHaveBeenCalledWith("/me/sendMail");
    const postArg = (req.post as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    expect(postArg["saveToSentItems"]).toBe(true);
    const msg = postArg["message"] as Record<string, unknown>;
    expect(msg["subject"]).toBe("Hello");
    expect((msg["toRecipients"] as Array<{ emailAddress: { address: string } }>)[0]!.emailAddress.address).toBe(
      "recipient@example.com",
    );

    expect(result.messageId).toBe("");
    expect(result.isDraft).toBe(false);
  });

  it("draftOnly: true creates draft via /messages and returns draft id", async () => {
    const { client } = makeClient("my-draft-id");
    const binary = makeBinary();

    const cfg: OutlookMessageSendOptions = {
      mailbox: "me",
      to: ["a@b.com"],
      subject: "Draft",
      body: "Content",
      bodyType: "html",
      draftOnly: true,
    };

    const result = await sendMessage(client as never, binary, {}, cfg);

    expect(client.api).toHaveBeenCalledWith("/me/messages");
    expect(result.messageId).toBe("my-draft-id");
    expect(result.isDraft).toBe(true);
  });

  it("sends with cc and bcc recipients", async () => {
    const { client, req } = makeClient();
    (req.post as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const binary = makeBinary();

    const cfg: OutlookMessageSendOptions = {
      mailbox: "me",
      to: ["to@example.com"],
      cc: ["cc@example.com"],
      bcc: ["bcc@example.com"],
      subject: "Test",
      body: "Body",
      bodyType: "text",
    };

    await sendMessage(client as never, binary, {}, cfg);

    const postArg = (req.post as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    const msg = postArg["message"] as Record<string, unknown>;
    expect(Array.isArray(msg["ccRecipients"])).toBe(true);
    expect(Array.isArray(msg["bccRecipients"])).toBe(true);
  });

  it("attaches binary as base64 fileAttachment in message body (not on item JSON)", async () => {
    const binary = makeBinary(Buffer.from("binary-content"));
    const itemBinary = makeItemBinary({ "file.txt": { mimeType: "text/plain" } });

    const { client, req } = makeClient();
    (req.post as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const cfg: OutlookMessageSendOptions = {
      mailbox: "me",
      to: ["x@y.com"],
      subject: "Attached",
      body: "See file",
      bodyType: "text",
      attachments: [{ slot: "file.txt", name: "file.txt" }],
    };

    await sendMessage(client as never, binary, itemBinary, cfg);

    const postArg = (req.post as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    const msg = postArg["message"] as Record<string, unknown>;
    const attachments = msg["attachments"] as Array<Record<string, unknown>>;
    expect(attachments).toHaveLength(1);
    expect(attachments[0]!["@odata.type"]).toBe("#microsoft.graph.fileAttachment");
    expect(Buffer.from(attachments[0]!["contentBytes"] as string, "base64").toString()).toBe("binary-content");
  });

  it("inline attachments set isInline: true and contentId", async () => {
    const binary = makeBinary(Buffer.from("img"));
    const itemBinary = makeItemBinary({ "logo.png": { mimeType: "image/png" } });

    const { client, req } = makeClient();
    (req.post as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const cfg: OutlookMessageSendOptions = {
      mailbox: "me",
      to: ["x@y.com"],
      subject: "Inline",
      body: '<img src="cid:logo@corp">',
      bodyType: "html",
      inlineAttachments: [{ slot: "logo.png", name: "logo.png", contentId: "logo@corp" }],
    };

    await sendMessage(client as never, binary, itemBinary, cfg);

    const postArg = (req.post as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    const msg = postArg["message"] as Record<string, unknown>;
    const attachments = msg["attachments"] as Array<Record<string, unknown>>;
    expect(attachments[0]!["isInline"]).toBe(true);
    expect(attachments[0]!["contentId"]).toBe("logo@corp");
  });

  it("sets importance on the message body when provided", async () => {
    const { client, req } = makeClient();
    (req.post as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const binary = makeBinary();

    const cfg: OutlookMessageSendOptions = {
      mailbox: "me",
      to: ["x@y.com"],
      subject: "Urgent",
      body: "Read now",
      bodyType: "text",
      importance: "high",
    };

    await sendMessage(client as never, binary, {}, cfg);

    const postArg = (req.post as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    const msg = postArg["message"] as Record<string, unknown>;
    expect(msg["importance"]).toBe("high");
  });

  it("uses /users/{mailbox} prefix for non-me mailboxes", async () => {
    const { client, req } = makeClient();
    (req.post as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const binary = makeBinary();

    const cfg: OutlookMessageSendOptions = {
      mailbox: "shared@contoso.com",
      to: ["x@y.com"],
      subject: "s",
      body: "b",
      bodyType: "text",
    };

    await sendMessage(client as never, binary, {}, cfg);

    expect(client.api).toHaveBeenCalledWith(expect.stringContaining("/users/shared%40contoso.com/sendMail"));
  });
});
