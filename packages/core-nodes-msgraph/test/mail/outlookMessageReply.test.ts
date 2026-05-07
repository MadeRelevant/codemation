import { describe, expect, it, vi } from "vitest";
import { replyToMessage } from "../../src/mail/outlookMessageReplyNode";
import type { OutlookMessageReplyOptions } from "../../src/mail/outlookMessageReplyNode";
import type { BinaryAttachment, NodeBinaryAttachmentService } from "@codemation/core";

// Narrow stub — the node calls .api(url).post() and .api(url).patch()
type GraphApiRequest = {
  post(body: unknown): Promise<unknown>;
  patch(body: unknown): Promise<unknown>;
};

type GraphClient = { api(url: string): GraphApiRequest };

function makeClient(draftId = "draft-1"): { client: GraphClient; req: GraphApiRequest } {
  const req: GraphApiRequest = {
    post: vi.fn().mockResolvedValue({ id: draftId }),
    patch: vi.fn().mockResolvedValue(undefined),
  };
  const client: GraphClient = { api: vi.fn().mockReturnValue(req) };
  return { client, req };
}

function makeBinary(fakeBytes = Buffer.from("hello world")): NodeBinaryAttachmentService {
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

describe("replyToMessage (outlookMessageReplyNode helper)", () => {
  it("happy path: createReply → PATCH body → POST send", async () => {
    const { client, req } = makeClient("draft-x");
    const binary = makeBinary();

    const cfg: OutlookMessageReplyOptions = {
      mailbox: "me",
      messageId: "msg-1",
      body: "<p>Thanks</p>",
      bodyType: "html",
    };

    const result = await replyToMessage(client as never, binary, {}, cfg);

    // createReply
    expect(client.api).toHaveBeenCalledWith("/me/messages/msg-1/createReply");
    // PATCH
    expect(req.patch).toHaveBeenCalledTimes(1);
    const patchArg = (req.patch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    expect((patchArg["body"] as Record<string, string>)["contentType"]).toBe("html");
    // send
    expect(client.api).toHaveBeenCalledWith("/me/messages/draft-x/send");

    expect(result.messageId).toBe("draft-x");
    expect(result.isDraft).toBe(false);
  });

  it("draftOnly: creates draft but does NOT call /send", async () => {
    const { client } = makeClient("draft-only");
    const binary = makeBinary();

    const cfg: OutlookMessageReplyOptions = {
      mailbox: "me",
      messageId: "msg-2",
      body: "Draft text",
      bodyType: "text",
      draftOnly: true,
    };

    const result = await replyToMessage(client as never, binary, {}, cfg);

    const apiCalls = (client.api as ReturnType<typeof vi.fn>).mock.calls as string[][];
    const sendCalls = apiCalls.flat().filter((url: string) => url.includes("/send"));
    expect(sendCalls).toHaveLength(0);

    expect(result.isDraft).toBe(true);
    expect(result.messageId).toBe("draft-only");
  });

  it("replyAll mode uses createReplyAll endpoint", async () => {
    const { client } = makeClient();
    const binary = makeBinary();

    const cfg: OutlookMessageReplyOptions = {
      mailbox: "me",
      messageId: "msg-3",
      body: "Replying all",
      bodyType: "text",
      replyAll: true,
    };

    await replyToMessage(client as never, binary, {}, cfg);

    expect(client.api).toHaveBeenCalledWith("/me/messages/msg-3/createReplyAll");
  });

  it("forward mode uses createForward endpoint", async () => {
    const { client } = makeClient();
    const binary = makeBinary();

    const cfg: OutlookMessageReplyOptions = {
      mailbox: "me",
      messageId: "msg-4",
      body: "Forwarding",
      bodyType: "text",
      forward: true,
      to: ["dest@example.com"],
    };

    await replyToMessage(client as never, binary, {}, cfg);

    expect(client.api).toHaveBeenCalledWith("/me/messages/msg-4/createForward");
  });

  it("attaches binary refs via POST /attachments (not in PATCH body)", async () => {
    const binary = makeBinary(Buffer.from("pdf-content"));
    const itemBinary = makeItemBinary({ "report.pdf": { mimeType: "application/pdf" } });

    const { client, req } = makeClient("draft-attach");

    const cfg: OutlookMessageReplyOptions = {
      mailbox: "me",
      messageId: "msg-attach",
      body: "See attached",
      bodyType: "text",
      draftOnly: true,
      attachments: [{ slot: "report.pdf", name: "report.pdf" }],
    };

    await replyToMessage(client as never, binary, itemBinary, cfg);

    // PATCH body should NOT contain attachments
    const patchArg = (req.patch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    expect(patchArg["attachments"]).toBeUndefined();

    // Attachment should be posted to /messages/{draftId}/attachments
    expect(client.api).toHaveBeenCalledWith(expect.stringContaining("/messages/draft-attach/attachments"));
    const postCalls = (req.post as ReturnType<typeof vi.fn>).mock.calls;
    const attachmentPost = postCalls.find((call: unknown[]) => {
      const arg = call[0] as Record<string, unknown> | undefined;
      return arg && arg["@odata.type"] === "#microsoft.graph.fileAttachment";
    });
    expect(attachmentPost).toBeDefined();
    const att = attachmentPost![0] as Record<string, unknown>;
    expect(typeof att["contentBytes"]).toBe("string");
    // eslint-disable-next-line codemation/no-buffer-everything -- test assertion decoding base64 contentBytes to verify round-trip correctness; bounded string in test data.
    expect(Buffer.from(att["contentBytes"] as string, "base64").toString()).toBe("pdf-content");
  });

  it("inline attachments use POST /attachments with isInline: true and contentId", async () => {
    const binary = makeBinary(Buffer.from("img-data"));
    const itemBinary = makeItemBinary({ "image.png": { mimeType: "image/png" } });

    const { client, req } = makeClient("draft-inline");

    const cfg: OutlookMessageReplyOptions = {
      mailbox: "me",
      messageId: "msg-inline",
      body: '<p><img src="cid:img001@example.com"/></p>',
      bodyType: "html",
      draftOnly: true,
      inlineAttachments: [{ slot: "image.png", name: "image.png", contentId: "img001@example.com" }],
    };

    await replyToMessage(client as never, binary, itemBinary, cfg);

    expect(client.api).toHaveBeenCalledWith(expect.stringContaining("/messages/draft-inline/attachments"));
    const postCalls = (req.post as ReturnType<typeof vi.fn>).mock.calls;
    const inlinePost = postCalls.find((call: unknown[]) => {
      const arg = call[0] as Record<string, unknown> | undefined;
      return arg && arg["isInline"] === true;
    });
    expect(inlinePost).toBeDefined();
    const att = inlinePost![0] as Record<string, unknown>;
    expect(att["isInline"]).toBe(true);
    expect(att["contentId"]).toBe("img001@example.com");
  });

  it("filterRecipients is applied to to/cc/bcc before PATCH", async () => {
    const { client, req } = makeClient("draft-filter");
    const binary = makeBinary();

    const cfg: OutlookMessageReplyOptions = {
      mailbox: "me",
      messageId: "msg-filter",
      body: "Hi",
      bodyType: "text",
      draftOnly: true,
      to: ["alice@example.com", "bob@example.com"],
      cc: ["carol@example.com"],
      filterRecipients: (rs) =>
        rs.filter((r) => ["alice@example.com", "carol@example.com"].includes(r.emailAddress.address)),
    };

    await replyToMessage(client as never, binary, {}, cfg);

    const patchArg = (req.patch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    const to = patchArg["toRecipients"] as Array<{ emailAddress: { address: string } }>;
    const cc = patchArg["ccRecipients"] as Array<{ emailAddress: { address: string } }>;
    expect(to).toHaveLength(1);
    expect(to[0]!.emailAddress.address).toBe("alice@example.com");
    expect(cc).toHaveLength(1);
    expect(cc[0]!.emailAddress.address).toBe("carol@example.com");
  });

  it("importance is included in PATCH body when set", async () => {
    const { client, req } = makeClient();
    const binary = makeBinary();

    const cfg: OutlookMessageReplyOptions = {
      mailbox: "me",
      messageId: "msg-importance",
      body: "Urgent",
      bodyType: "text",
      importance: "high",
    };

    await replyToMessage(client as never, binary, {}, cfg);

    const patchArg = (req.patch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    expect(patchArg["importance"]).toBe("high");
  });

  it("throws early when forward: true but no to recipients provided", async () => {
    const { client } = makeClient();
    const binary = makeBinary();

    const cfg: OutlookMessageReplyOptions = {
      mailbox: "me",
      messageId: "msg-forward-no-to",
      body: "Forwarding",
      bodyType: "text",
      forward: true,
      // No `to` provided — should throw
    };

    await expect(replyToMessage(client as never, binary, {}, cfg)).rejects.toThrow(
      /forward.*requires.*to|to.*required.*forward/i,
    );
  });
});
