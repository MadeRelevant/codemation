import { describe, expect, it, vi } from "vitest";
import { OutlookMessageReply, OutlookMessageReplyNode } from "../../src/mail/outlookMessageReplyNode";

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

// Build a minimal binary attachment mock for ctx.binary
function makeBinary(fakeBytes = Buffer.from("hello world")) {
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
  };
}

function makeItem(binarySlots: Record<string, { mimeType: string }> = {}) {
  return {
    json: { messageId: "parent-msg" },
    binary: Object.fromEntries(
      Object.entries(binarySlots).map(([slot, meta]) => [
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
        },
      ]),
    ),
  };
}

function makeCtx(cfg: ConstructorParameters<typeof OutlookMessageReply>[1], binary = makeBinary()) {
  const session = { accessToken: "tok", refresh: vi.fn() };
  return {
    config: new OutlookMessageReply("reply", cfg),
    getCredential: vi.fn().mockResolvedValue(session),
    binary,
  };
}

describe("OutlookMessageReplyNode", () => {
  it("happy path: createReply → PATCH body → POST send", async () => {
    const { client, req } = makeClient("draft-x");
    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({
        mailbox: "me",
        messageId: "msg-1",
        body: "<p>Thanks</p>",
        bodyType: "html",
      });

      const result = await new OutlookMessageReplyNode().execute({
        item: { json: {} },
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      // createReply
      expect(client.api).toHaveBeenCalledWith("/me/messages/msg-1/createReply");
      // PATCH
      expect(req.patch).toHaveBeenCalledTimes(1);
      const patchArg = (req.patch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
      expect((patchArg["body"] as Record<string, string>)["contentType"]).toBe("html");
      // send
      expect(client.api).toHaveBeenCalledWith("/me/messages/draft-x/send");

      const out = result as { json: { messageId: string; isDraft: boolean } };
      expect(out.json.messageId).toBe("draft-x");
      expect(out.json.isDraft).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it("draftOnly: creates draft but does NOT call /send", async () => {
    const { client } = makeClient("draft-only");
    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({
        mailbox: "me",
        messageId: "msg-2",
        body: "Draft text",
        bodyType: "text",
        draftOnly: true,
      });

      const result = await new OutlookMessageReplyNode().execute({
        item: { json: {} },
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      // send endpoint should NOT have been called
      const apiCalls = (client.api as ReturnType<typeof vi.fn>).mock.calls as string[][];
      const sendCalls = apiCalls.flat().filter((url: string) => url.includes("/send"));
      expect(sendCalls).toHaveLength(0);

      const out = result as { json: { messageId: string; isDraft: boolean } };
      expect(out.json.isDraft).toBe(true);
      expect(out.json.messageId).toBe("draft-only");
    } finally {
      spy.mockRestore();
    }
  });

  it("replyAll mode uses createReplyAll endpoint", async () => {
    const { client } = makeClient();
    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({
        mailbox: "me",
        messageId: "msg-3",
        body: "Replying all",
        bodyType: "text",
        replyAll: true,
      });

      await new OutlookMessageReplyNode().execute({
        item: { json: {} },
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      expect(client.api).toHaveBeenCalledWith("/me/messages/msg-3/createReplyAll");
    } finally {
      spy.mockRestore();
    }
  });

  it("forward mode uses createForward endpoint", async () => {
    const { client } = makeClient();
    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({
        mailbox: "me",
        messageId: "msg-4",
        body: "Forwarding",
        bodyType: "text",
        forward: true,
        to: ["dest@example.com"],
      });

      await new OutlookMessageReplyNode().execute({
        item: { json: {} },
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      expect(client.api).toHaveBeenCalledWith("/me/messages/msg-4/createForward");
    } finally {
      spy.mockRestore();
    }
  });

  it("attaches binary refs via POST /attachments (not in PATCH body, to avoid silent Graph ignore)", async () => {
    const binary = makeBinary(Buffer.from("pdf-content"));
    const item = makeItem({ "report.pdf": { mimeType: "application/pdf" } });

    const { client, req } = makeClient("draft-attach");
    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = {
        config: new OutlookMessageReply("reply", {
          mailbox: "me",
          messageId: "msg-attach",
          body: "See attached",
          bodyType: "text",
          draftOnly: true,
          attachments: [{ slot: "report.pdf", name: "report.pdf" }],
        }),
        getCredential: vi.fn().mockResolvedValue({ accessToken: "tok", refresh: vi.fn() }),
        binary,
      };

      await new OutlookMessageReplyNode().execute({
        item,
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      // PATCH body should NOT contain attachments (Graph ignores them on existing drafts)
      const patchArg = (req.patch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
      expect(patchArg["attachments"]).toBeUndefined();

      // Attachment should be posted to /messages/{draftId}/attachments
      expect(client.api).toHaveBeenCalledWith(expect.stringContaining("/messages/draft-attach/attachments"));
      const postCalls = (req.post as ReturnType<typeof vi.fn>).mock.calls;
      // First post is createReply, second is the attachment
      const attachmentPost = postCalls.find((call: unknown[]) => {
        const arg = call[0] as Record<string, unknown> | undefined;
        return arg && arg["@odata.type"] === "#microsoft.graph.fileAttachment";
      });
      expect(attachmentPost).toBeDefined();
      const att = attachmentPost![0] as Record<string, unknown>;
      expect(typeof att["contentBytes"]).toBe("string");
      expect(Buffer.from(att["contentBytes"] as string, "base64").toString()).toBe("pdf-content");
    } finally {
      spy.mockRestore();
    }
  });

  it("inline attachments use POST /attachments with isInline: true and contentId", async () => {
    const binary = makeBinary(Buffer.from("img-data"));
    const item = makeItem({ "image.png": { mimeType: "image/png" } });

    const { client, req } = makeClient("draft-inline");
    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = {
        config: new OutlookMessageReply("reply", {
          mailbox: "me",
          messageId: "msg-inline",
          body: '<p><img src="cid:img001@example.com"/></p>',
          bodyType: "html",
          draftOnly: true,
          inlineAttachments: [{ slot: "image.png", name: "image.png", contentId: "img001@example.com" }],
        }),
        getCredential: vi.fn().mockResolvedValue({ accessToken: "tok", refresh: vi.fn() }),
        binary,
      };

      await new OutlookMessageReplyNode().execute({
        item,
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      // Inline attachment posted to /attachments endpoint
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
    } finally {
      spy.mockRestore();
    }
  });

  it("filterRecipients is applied to to/cc/bcc before PATCH", async () => {
    const { client, req } = makeClient("draft-filter");
    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({
        mailbox: "me",
        messageId: "msg-filter",
        body: "Hi",
        bodyType: "text",
        draftOnly: true,
        to: ["alice@example.com", "bob@example.com"],
        cc: ["carol@example.com"],
        // Filter: keep only alice and carol
        filterRecipients: (rs) =>
          rs.filter((r) => ["alice@example.com", "carol@example.com"].includes(r.emailAddress.address)),
      });

      await new OutlookMessageReplyNode().execute({
        item: { json: {} },
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      const patchArg = (req.patch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
      const to = patchArg["toRecipients"] as Array<{ emailAddress: { address: string } }>;
      const cc = patchArg["ccRecipients"] as Array<{ emailAddress: { address: string } }>;
      expect(to).toHaveLength(1);
      expect(to[0]!.emailAddress.address).toBe("alice@example.com");
      expect(cc).toHaveLength(1);
      expect(cc[0]!.emailAddress.address).toBe("carol@example.com");
    } finally {
      spy.mockRestore();
    }
  });

  it("importance is included in PATCH body when set", async () => {
    const { client, req } = makeClient();
    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({
        mailbox: "me",
        messageId: "msg-importance",
        body: "Urgent",
        bodyType: "text",
        importance: "high",
      });

      await new OutlookMessageReplyNode().execute({
        item: { json: {} },
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      const patchArg = (req.patch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
      expect(patchArg["importance"]).toBe("high");
    } finally {
      spy.mockRestore();
    }
  });

  it("throws early when forward: true but no to recipients provided", async () => {
    const node = new OutlookMessageReplyNode();
    const ctx = makeCtx({
      mailbox: "me",
      messageId: "msg-forward-no-to",
      body: "Forwarding",
      bodyType: "text",
      forward: true,
      // No `to` provided — should throw
    });

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue({ api: vi.fn() } as never);

    try {
      await expect(
        node.execute({ item: { json: {} }, ctx: ctx as never, input: {} as never, itemIndex: 0, items: [] as never }),
      ).rejects.toThrow(/forward.*requires.*to|to.*required.*forward/i);
    } finally {
      spy.mockRestore();
    }
  });
});
