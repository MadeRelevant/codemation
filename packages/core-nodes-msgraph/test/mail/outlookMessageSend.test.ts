import { describe, expect, it, vi } from "vitest";
import { OutlookMessageSend, OutlookMessageSendNode } from "../../src/mail/outlookMessageSendNode";

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

function makeBinary(fakeBytes = Buffer.from("attachment data")) {
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
    json: {},
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

function makeCtx(cfg: ConstructorParameters<typeof OutlookMessageSend>[1], binary = makeBinary()) {
  const session = { accessToken: "tok", refresh: vi.fn() };
  return {
    config: new OutlookMessageSend("send", cfg),
    getCredential: vi.fn().mockResolvedValue(session),
    binary,
  };
}

describe("OutlookMessageSendNode", () => {
  it("happy path (draftOnly: false): calls /sendMail and returns messageId: ''", async () => {
    const { client, req } = makeClient();
    // /sendMail returns 202 No Content (undefined)
    (req.post as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({
        mailbox: "me",
        to: ["recipient@example.com"],
        subject: "Hello",
        body: "World",
        bodyType: "text",
      });

      const result = await new OutlookMessageSendNode().execute({
        item: { json: {} },
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      expect(client.api).toHaveBeenCalledWith("/me/sendMail");
      const postArg = (req.post as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
      expect(postArg["saveToSentItems"]).toBe(true);
      const msg = postArg["message"] as Record<string, unknown>;
      expect(msg["subject"]).toBe("Hello");
      expect((msg["toRecipients"] as Array<{ emailAddress: { address: string } }>)[0]!.emailAddress.address).toBe(
        "recipient@example.com",
      );

      const out = result as { json: { messageId: string; isDraft: boolean } };
      expect(out.json.messageId).toBe("");
      expect(out.json.isDraft).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it("draftOnly: true creates draft via /messages and returns draft id", async () => {
    const { client } = makeClient("my-draft-id");
    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({
        mailbox: "me",
        to: ["a@b.com"],
        subject: "Draft",
        body: "Content",
        bodyType: "html",
        draftOnly: true,
      });

      const result = await new OutlookMessageSendNode().execute({
        item: { json: {} },
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      expect(client.api).toHaveBeenCalledWith("/me/messages");
      const out = result as { json: { messageId: string; isDraft: boolean } };
      expect(out.json.messageId).toBe("my-draft-id");
      expect(out.json.isDraft).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("sends with cc and bcc recipients", async () => {
    const { client, req } = makeClient();
    (req.post as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({
        mailbox: "me",
        to: ["to@example.com"],
        cc: ["cc@example.com"],
        bcc: ["bcc@example.com"],
        subject: "Test",
        body: "Body",
        bodyType: "text",
      });

      await new OutlookMessageSendNode().execute({
        item: { json: {} },
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      const postArg = (req.post as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
      const msg = postArg["message"] as Record<string, unknown>;
      expect(Array.isArray(msg["ccRecipients"])).toBe(true);
      expect(Array.isArray(msg["bccRecipients"])).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("attaches binary as base64 fileAttachment in message body (not on item JSON)", async () => {
    const binary = makeBinary(Buffer.from("binary-content"));
    const item = makeItem({ "file.txt": { mimeType: "text/plain" } });

    const { client, req } = makeClient();
    (req.post as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = {
        config: new OutlookMessageSend("send", {
          mailbox: "me",
          to: ["x@y.com"],
          subject: "Attached",
          body: "See file",
          bodyType: "text",
          attachments: [{ slot: "file.txt", name: "file.txt" }],
        }),
        getCredential: vi.fn().mockResolvedValue({ accessToken: "tok", refresh: vi.fn() }),
        binary,
      };

      await new OutlookMessageSendNode().execute({
        item,
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      const postArg = (req.post as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
      const msg = postArg["message"] as Record<string, unknown>;
      const attachments = msg["attachments"] as Array<Record<string, unknown>>;
      expect(attachments).toHaveLength(1);
      expect(attachments[0]!["@odata.type"]).toBe("#microsoft.graph.fileAttachment");
      expect(Buffer.from(attachments[0]!["contentBytes"] as string, "base64").toString()).toBe("binary-content");
    } finally {
      spy.mockRestore();
    }
  });

  it("inline attachments set isInline: true and contentId", async () => {
    const binary = makeBinary(Buffer.from("img"));
    const item = makeItem({ "logo.png": { mimeType: "image/png" } });

    const { client, req } = makeClient();
    (req.post as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = {
        config: new OutlookMessageSend("send", {
          mailbox: "me",
          to: ["x@y.com"],
          subject: "Inline",
          body: '<img src="cid:logo@corp">',
          bodyType: "html",
          inlineAttachments: [{ slot: "logo.png", name: "logo.png", contentId: "logo@corp" }],
        }),
        getCredential: vi.fn().mockResolvedValue({ accessToken: "tok", refresh: vi.fn() }),
        binary,
      };

      await new OutlookMessageSendNode().execute({
        item,
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      const postArg = (req.post as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
      const msg = postArg["message"] as Record<string, unknown>;
      const attachments = msg["attachments"] as Array<Record<string, unknown>>;
      expect(attachments[0]!["isInline"]).toBe(true);
      expect(attachments[0]!["contentId"]).toBe("logo@corp");
    } finally {
      spy.mockRestore();
    }
  });

  it("sets importance on the message body when provided", async () => {
    const { client, req } = makeClient();
    (req.post as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({
        mailbox: "me",
        to: ["x@y.com"],
        subject: "Urgent",
        body: "Read now",
        bodyType: "text",
        importance: "high",
      });

      await new OutlookMessageSendNode().execute({
        item: { json: {} },
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      const postArg = (req.post as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
      const msg = postArg["message"] as Record<string, unknown>;
      expect(msg["importance"]).toBe("high");
    } finally {
      spy.mockRestore();
    }
  });

  it("uses /users/{mailbox} prefix for non-me mailboxes", async () => {
    const { client, req } = makeClient();
    (req.post as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const mod = await import("../../src/credentials/session");
    const spy = vi.spyOn(mod, "createGraphClient").mockReturnValue(client as never);

    try {
      const ctx = makeCtx({
        mailbox: "shared@contoso.com",
        to: ["x@y.com"],
        subject: "s",
        body: "b",
        bodyType: "text",
      });

      await new OutlookMessageSendNode().execute({
        item: { json: {} },
        ctx: ctx as never,
        input: {} as never,
        itemIndex: 0,
        items: [] as never,
      });

      expect(client.api).toHaveBeenCalledWith(expect.stringContaining("/users/shared%40contoso.com/sendMail"));
    } finally {
      spy.mockRestore();
    }
  });
});
